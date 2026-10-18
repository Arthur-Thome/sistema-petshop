Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, exitCode
Dim policyPlan, policyDetail, failure
Dim selfTestOnly, endpointTestOnly, sessionDiagnosticOnly, keepOpen, scriptArguments
Dim capturedOutput, capturedError, launchFailure
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\Importar-Homologacao-Neon.ps1"
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If Not fso.FileExists(scriptPath) Then
  MsgBox "O executor de importacao Neon nao foi encontrado. Nenhum banco foi conectado.", vbExclamation, "Amores Pet - Importacao Neon"
  WScript.Quit 2
End If
If Not fso.FileExists(powershellPath) Then
  MsgBox "Windows PowerShell 5.1 nao foi encontrado. Nenhum banco foi conectado.", vbExclamation, "Amores Pet - Importacao Neon"
  WScript.Quit 2
End If

policyPlan = GetExecutionPolicyPlan(powershellPath, policyDetail)
If WScript.Arguments.Named.Exists("testarPolitica") Then
  WScript.Echo "POLITICA_PROCESSO=" & policyPlan
  WScript.Echo "ESCOPOS_PERSISTENTES_ALTERADOS=NAO"
  WScript.Quit 0
End If
selfTestOnly = WScript.Arguments.Named.Exists("selfTestOnly")
endpointTestOnly = WScript.Arguments.Named.Exists("testarEndpoint")
sessionDiagnosticOnly = WScript.Arguments.Named.Exists("diagnosticarSessoes")
keepOpen = " -NoExit"
scriptArguments = ""
If (selfTestOnly And endpointTestOnly) Or (selfTestOnly And sessionDiagnosticOnly) Or (endpointTestOnly And sessionDiagnosticOnly) Then
  MsgBox "Escolha somente um modo de execucao. Nenhuma importacao foi iniciada.", vbExclamation, "Amores Pet - Importacao Neon"
  WScript.Quit 2
End If
If selfTestOnly Then
  keepOpen = ""
  scriptArguments = " -SelfTestOnly"
ElseIf endpointTestOnly Then
  keepOpen = ""
  scriptArguments = " -TestEndpointOnly"
ElseIf sessionDiagnosticOnly Then
  scriptArguments = " -DiagnoseSessionsOnly"
End If
If Left(policyPlan, 8) = "BLOCKED:" Then
  MsgBox "Codigo AP-NEON-VBS-EXEC-POLICY: a politica do Windows bloqueia o executor. Nenhuma politica foi alterada e nenhum banco foi consultado.", vbExclamation, "Amores Pet - Importacao Neon"
  WScript.Quit 1
ElseIf policyPlan = "ERROR" Then
  MsgBox "Codigo AP-NEON-VBS-POLICY-CHECK: nao foi possivel validar a politica. Nenhum banco foi consultado.", vbExclamation, "Amores Pet - Importacao Neon"
  WScript.Quit 2
End If

If policyPlan = "REMOTE_SIGNED_DEFAULT_PROCESS" Then
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy RemoteSigned" & keepOpen & " -File " & Chr(34) & scriptPath & Chr(34) & scriptArguments
Else
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile" & keepOpen & " -File " & Chr(34) & scriptPath & Chr(34) & scriptArguments
End If

If selfTestOnly Or endpointTestOnly Then
  exitCode = RunCaptured(shell, command, capturedOutput, capturedError, launchFailure)
  If launchFailure <> 0 Then
    WScript.Echo "CODIGO=AP-NEON-VBS-LAUNCH; PowerShell nao iniciou; falha de teste local."
    WScript.Quit 3
  End If
  If Len(capturedOutput) > 0 Then WScript.Echo capturedOutput
  If Len(capturedError) > 0 Then WScript.Echo "POWERSHELL_STDERR=PRESENTE_REDACTADO"
Else
  On Error Resume Next
  exitCode = shell.Run(command, 1, True)
  If Err.Number <> 0 Then
    failure = Err.Number
    Err.Clear
    On Error GoTo 0
    MsgBox "Codigo AP-NEON-VBS-LAUNCH: nao foi possivel iniciar o PowerShell (" & CStr(failure) & "). Nenhuma importacao foi executada.", vbExclamation, "Amores Pet - Importacao Neon"
    WScript.Quit 3
  End If
  On Error GoTo 0
End If
If exitCode <> 0 Then
  If selfTestOnly Then
    WScript.Echo "SELF_TEST_VBS=FALHA; POWERSHELL_EXIT=" & CStr(exitCode)
  ElseIf endpointTestOnly Then
    WScript.Echo "ENDPOINT_TEST_VBS=FALHA; POWERSHELL_EXIT=" & CStr(exitCode)
  ElseIf sessionDiagnosticOnly Then
    WScript.Echo "SESSION_DIAGNOSTIC_VBS=FALHA; POWERSHELL_EXIT=" & CStr(exitCode)
  Else
    MsgBox "O PowerShell terminou com codigo " & CStr(exitCode) & ". Consulte a etapa e o relatorio sanitizado no console que permaneceu aberto.", vbExclamation, "Amores Pet - Importacao Neon"
  End If
ElseIf selfTestOnly Then
  WScript.Echo "SELF_TEST_VBS=APROVADO; PostgreSQL 17 descartavel; SAN incompatível, wildcard, CA, TLS e allowlist testados; nenhum banco persistente ou Neon conectado."
ElseIf endpointTestOnly Then
  WScript.Echo "ENDPOINT_TEST_VBS=APROVADO; validacao direta e mapeamento simulados; nenhuma conexao Neon ou escrita iniciada."
ElseIf sessionDiagnosticOnly Then
  WScript.Echo "SESSION_DIAGNOSTIC_VBS=CONCLUIDO; consulta somente leitura; nenhuma escrita ou encerramento de sessao executado."
End If
WScript.Quit exitCode

Function RunCaptured(processShell, processCommand, ByRef outputText, ByRef errorText, ByRef launchFailure)
  Dim process
  RunCaptured = -1
  outputText = ""
  errorText = ""
  launchFailure = 0
  On Error Resume Next
  Set process = processShell.Exec(processCommand)
  If Err.Number <> 0 Then
    launchFailure = Err.Number
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  On Error GoTo 0
  Do While process.Status = 0
    WScript.Sleep 100
  Loop
  outputText = process.StdOut.ReadAll
  errorText = process.StdErr.ReadAll
  RunCaptured = process.ExitCode
End Function

Function GetExecutionPolicyPlan(processPath, ByRef detail)
  Dim policyCommand, outputText, errorText, launchFailure, resultCode, lines, line, fields, allUndefined, index, effective
  detail = ""
  GetExecutionPolicyPlan = "ERROR"
  policyCommand = Chr(34) & processPath & Chr(34) & " -NoProfile -NonInteractive -Command " & Chr(34) & _
    "$scopes=@('MachinePolicy','UserPolicy','Process','CurrentUser','LocalMachine'); $values=@((Get-ExecutionPolicy).ToString()); foreach($scope in $scopes){$values += [string](Get-ExecutionPolicy -Scope $scope)}; Write-Output ('AP_POLICY|' + ($values -join '|'))" & Chr(34)
  resultCode = RunCaptured(shell, policyCommand, outputText, errorText, launchFailure)
  If launchFailure <> 0 Or resultCode <> 0 Then Exit Function
  lines = Split(outputText, vbLf)
  For Each line In lines
    line = Replace(Trim(CStr(line)), vbCr, "")
    If Left(line, 10) = "AP_POLICY|" Then
      fields = Split(Mid(line, 11), "|")
      If UBound(fields) <> 5 Then Exit Function
      effective = UCase(Trim(CStr(fields(0))))
      allUndefined = True
      For index = 1 To 5
        If UCase(Trim(CStr(fields(index)))) <> "UNDEFINED" Then allUndefined = False
      Next
      detail = "Effective policy: " & effective
      If allUndefined And effective = "RESTRICTED" Then
        GetExecutionPolicyPlan = "REMOTE_SIGNED_DEFAULT_PROCESS"
      ElseIf effective = "RESTRICTED" Or effective = "ALLSIGNED" Then
        GetExecutionPolicyPlan = "BLOCKED:" & effective
      Else
        GetExecutionPolicyPlan = "EXISTING_POLICY"
      End If
      Exit Function
    End If
  Next
End Function
