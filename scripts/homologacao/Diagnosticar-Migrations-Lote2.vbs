Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, child, exitCode
Dim reportDirectory, localAppData, reportPath, privateDetailPath, simulatedFailure, policyTestMode, stdoutText, stderrText
Dim launchError, diagnosticClass, technicalCode, safeOutput
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\Diagnosticar-Migrations-Lote2.ps1"
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
reportDirectory = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\AmoresPet\DiagnosticosMigracoes"
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
simulatedFailure = ""
If WScript.Arguments.Named.Exists("simularFalha") Then simulatedFailure = UCase(Trim(WScript.Arguments.Named.Item("simularFalha")))
policyTestMode = WScript.Arguments.Named.Exists("testarPolitica")

exitCode = 0
diagnosticClass = "AUXILIAR"
technicalCode = ""
safeOutput = ""
If Not fso.FileExists(scriptPath) Then
  exitCode = 2
  technicalCode = "AP-VBS-SCRIPT-MISSING"
  safeOutput = "O auxiliar PowerShell nao foi encontrado. Nenhum banco foi consultado."
ElseIf Not fso.FileExists(powershellPath) Then
  exitCode = 2
  technicalCode = "AP-VBS-POWERSHELL-MISSING"
  safeOutput = "Windows PowerShell nao foi encontrado. Nenhum banco foi consultado."
ElseIf simulatedFailure <> "" And simulatedFailure <> "ACESSO" And simulatedFailure <> "CONEXAO" And simulatedFailure <> "PROCESSO" And simulatedFailure <> "AUXILIAR" Then
  exitCode = 2
  technicalCode = "AP-VBS-INVALID-SIMULATION"
    safeOutput = "Categoria de simulacao invalida. Opcoes: ACESSO, CONEXAO, PROCESSO ou AUXILIAR."
Else
  If simulatedFailure <> "" Then
    command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -NonInteractive -Command " & Chr(34) & _
      "Write-Output 'SIMULATED_CATEGORY=" & simulatedFailure & "'; exit 1" & Chr(34)
    exitCode = RunCaptured(shell, command, stdoutText, stderrText, launchError)
    If launchError <> 0 Then
      exitCode = 2
      technicalCode = "AP-VBS-EXEC-" & CStr(launchError)
      safeOutput = "Nao foi possivel iniciar o processo PowerShell simulado."
    Else
      diagnosticClass = simulatedFailure
      technicalCode = "TEST-AP-DIAG-" & simulatedFailure
      safeOutput = "Falha simulada; nenhuma configuracao ou banco foi acessado."
    End If
  Else
    Dim policyPlan, policyDetail, launcherPolicyMode
    policyPlan = GetExecutionPolicyPlan(powershellPath, policyDetail)
    If Left(policyPlan, 8) = "BLOCKED:" Then
      exitCode = 1
      diagnosticClass = "POLITICA_DE_EXECUCAO"
      technicalCode = "AP-VBS-EXEC-POLICY-" & Mid(policyPlan, 9)
      safeOutput = "Uma politica de execucao explicitamente configurada bloqueou o auxiliar; nenhuma politica foi alterada. " & policyDetail
    ElseIf policyPlan = "ERROR" Then
      exitCode = 2
      diagnosticClass = "AUXILIAR"
      technicalCode = "AP-VBS-EXEC-POLICY-CHECK"
      safeOutput = "Nao foi possivel consultar com seguranca a politica de execucao; nenhum auxiliar ou banco foi iniciado."
    Else
      If policyPlan = "REMOTE_SIGNED_DEFAULT_PROCESS" Then
        launcherPolicyMode = "REMOTE_SIGNED_DEFAULT_PROCESS"
        command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File " & Chr(34) & scriptPath & Chr(34)
      Else
        launcherPolicyMode = "EXISTING_POLICY"
        command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -NonInteractive -File " & Chr(34) & scriptPath & Chr(34)
      End If
      command = command & " -LauncherPolicyMode " & launcherPolicyMode
      exitCode = RunCaptured(shell, command, stdoutText, stderrText, launchError)
      If launchError <> 0 Then
        exitCode = 2
        diagnosticClass = "AUXILIAR"
        technicalCode = "AP-VBS-EXEC-" & CStr(launchError)
        safeOutput = "Nao foi possivel iniciar o auxiliar PowerShell. Nenhum banco foi consultado."
      Else
        reportPath = ExtractReportPath(fso, stdoutText, reportDirectory)
        privateDetailPath = ExtractPrivatePsqlDetailPath(fso, stdoutText, _
          localAppData & "\AmoresPet\Homologacao")
        If reportPath = "" Then
          diagnosticClass = IdentifyFailureClass(stdoutText & vbCrLf & stderrText)
          technicalCode = IdentifyTechnicalCode(stdoutText & vbCrLf & stderrText, exitCode, diagnosticClass)
          safeOutput = SanitizeOutputText(stdoutText & vbCrLf & stderrText)
        End If
      End If
    End If
  End If
End If

If reportPath = "" Then reportPath = WriteFallbackReport(fso, localAppData, diagnosticClass, technicalCode, safeOutput, exitCode)

If simulatedFailure <> "" Or policyTestMode Then
  If policyTestMode Then WScript.Echo "POLICY_EXECUTION_TEST=TRUE"
  If simulatedFailure <> "" Then WScript.Echo "SIMULATED_CATEGORY=" & simulatedFailure
  WScript.Echo "PROPAGATED_EXIT_CODE=" & CStr(exitCode)
  If reportPath <> "" Then
    WScript.Echo "SANITIZED_REPORT=AVAILABLE"
    WScript.Echo ReadSafeReport(fso, reportPath)
  Else
    WScript.Echo "SANITIZED_REPORT=MISSING"
    WScript.Echo "CATEGORY=" & diagnosticClass
    WScript.Echo "TECHNICAL_CODE=" & technicalCode
    WScript.Echo safeOutput
  End If
  WScript.Quit exitCode
End If

If reportPath <> "" Then
  OpenReport shell, fso, reportPath
Else
  MsgBox "Diagnostico sem relatorio local. Categoria: " & diagnosticClass & vbCrLf & _
    "Codigo tecnico: " & technicalCode & vbCrLf & "Codigo de saida: " & CStr(exitCode) & vbCrLf & _
    "Mensagem sanitizada: " & safeOutput, vbExclamation, "Amores Pet - Diagnostico Lote 2"
End If
If privateDetailPath <> "" Then
  MsgBox "O psql retornou um erro sem classificacao automatica. O detalhe sera aberto somente nesta maquina e pode conter identificadores locais. Nao copie nem compartilhe esse conteudo.", _
    vbInformation, "Amores Pet - Detalhe privado do psql"
  OpenReport shell, fso, privateDetailPath
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
      detail = "Politica efetiva: " & effective & "; escopos persistentes foram lidos sem alteracao."
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

Function ExtractReportPath(fileSystem, outputText, folderPath)
  Dim folder, reportFile, lines, line, candidate, expectedPrefix, regex
  ExtractReportPath = ""
  On Error Resume Next
  If Not fileSystem.FolderExists(folderPath) Then Exit Function
  Set folder = fileSystem.GetFolder(folderPath)
  If (folder.Attributes And 1024) <> 0 Then Exit Function
  expectedPrefix = folderPath & "\"
  lines = Split(outputText, vbLf)
  For Each line In lines
    line = Replace(Trim(CStr(line)), vbCr, "")
    If Left(line, Len("DIAG_REPORT=")) = "DIAG_REPORT=" Then
      candidate = Mid(line, Len("DIAG_REPORT=") + 1)
      If LCase(Left(candidate, Len(expectedPrefix))) = LCase(expectedPrefix) And fileSystem.FileExists(candidate) Then
        Set reportFile = fileSystem.GetFile(candidate)
        Set regex = New RegExp
        regex.IgnoreCase = True
        regex.Global = False
        regex.Pattern = "^Diagnostico-Migrations-Lote2-[0-9]{8}-[0-9]{6}-[a-f0-9]{32}\.txt$"
        If (reportFile.Attributes And 1024) = 0 And regex.Test(reportFile.Name) Then ExtractReportPath = candidate
      End If
    End If
  Next
  On Error GoTo 0
End Function

Function ExtractPrivatePsqlDetailPath(fileSystem, outputText, folderPath)
  Dim lines, line, candidateName, candidatePath, reportFile, regex
  ExtractPrivatePsqlDetailPath = ""
  On Error Resume Next
  If Not fileSystem.FolderExists(folderPath) Then Exit Function
  lines = Split(outputText, vbLf)
  For Each line In lines
    line = Replace(Trim(CStr(line)), vbCr, "")
    If Left(line, Len("DIAG_PRIVATE_PSQL_DETAIL=")) = "DIAG_PRIVATE_PSQL_DETAIL=" Then
      candidateName = Mid(line, Len("DIAG_PRIVATE_PSQL_DETAIL=") + 1)
      Set regex = New RegExp
      regex.IgnoreCase = True
      regex.Global = False
      regex.Pattern = "^psql-diagnostic-[0-9]{8}-[0-9]{6}-[a-f0-9]{32}\.txt$"
      If regex.Test(candidateName) Then
        candidatePath = fileSystem.BuildPath(folderPath, candidateName)
        If fileSystem.FileExists(candidatePath) Then
          Set reportFile = fileSystem.GetFile(candidatePath)
          If (reportFile.Attributes And 1026) = 0 And reportFile.Size <= 140000 Then
            ExtractPrivatePsqlDetailPath = candidatePath
          End If
        End If
      End If
    End If
  Next
  On Error GoTo 0
End Function

Function IdentifyFailureClass(value)
  Dim lower
  lower = LCase(CStr(value))
  If InStr(lower, "categoria: psql_argumentos") > 0 Then
    IdentifyFailureClass = "PSQL_ARGUMENTOS"
  ElseIf InStr(lower, "categoria: psql_arquivo") > 0 Then
    IdentifyFailureClass = "PSQL_ARQUIVO"
  ElseIf InStr(lower, "categoria: psql_autenticacao") > 0 Then
    IdentifyFailureClass = "PSQL_AUTENTICACAO"
  ElseIf InStr(lower, "categoria: psql_conexao") > 0 Then
    IdentifyFailureClass = "PSQL_CONEXAO"
  ElseIf InStr(lower, "categoria: psql_destino_inexistente") > 0 Then
    IdentifyFailureClass = "PSQL_DESTINO_INEXISTENTE"
  ElseIf InStr(lower, "categoria: psql_permissao_sql") > 0 Then
    IdentifyFailureClass = "PSQL_PERMISSAO_SQL"
  ElseIf InStr(lower, "categoria: psql_erro_sql") > 0 Then
    IdentifyFailureClass = "PSQL_ERRO_SQL"
  ElseIf InStr(lower, "categoria: psql_nao_classificado") > 0 Then
    IdentifyFailureClass = "PSQL_NAO_CLASSIFICADO"
  ElseIf InStr(lower, "categoria: processo") > 0 Or InStr(lower, "ap-diag-psql-launch-") > 0 Then
    IdentifyFailureClass = "PROCESSO"
  ElseIf InStr(lower, "about_execution_policies") > 0 Or _
     (InStr(lower, "script") > 0 And (InStr(lower, "disabled") > 0 Or InStr(lower, "desabilitad") > 0)) Then
    IdentifyFailureClass = "POLITICA_DE_EXECUCAO"
  ElseIf InStr(lower, "psql") > 0 Or InStr(lower, "postgresql") > 0 Or InStr(lower, "connection refused") > 0 Or InStr(lower, "conexao") > 0 Then
    IdentifyFailureClass = "CONEXAO"
  ElseIf InStr(lower, "access denied") > 0 Or InStr(lower, "acesso negado") > 0 Or InStr(lower, "unauthorizedaccess") > 0 Then
    IdentifyFailureClass = "ACESSO"
  Else
    IdentifyFailureClass = "AUXILIAR"
  End If
End Function

Function IdentifyTechnicalCode(value, processExitCode, failureClass)
  Dim lower, codePosition, codeEnd
  lower = LCase(CStr(value))
  codePosition = InStr(lower, "ap-psql-")
  If codePosition > 0 Then
    codeEnd = InStr(codePosition, value, vbCr)
    If codeEnd = 0 Then codeEnd = InStr(codePosition, value, vbLf)
    If codeEnd = 0 Then codeEnd = Len(value) + 1
    IdentifyTechnicalCode = Mid(value, codePosition, codeEnd - codePosition)
    Exit Function
  End If
  codePosition = InStr(lower, "ap-diag-psql-launch-")
  If codePosition > 0 Then
    codeEnd = InStr(codePosition, value, vbCr)
    If codeEnd = 0 Then codeEnd = InStr(codePosition, value, vbLf)
    If codeEnd = 0 Then codeEnd = Len(value) + 1
    IdentifyTechnicalCode = Mid(value, codePosition, codeEnd - codePosition)
  ElseIf failureClass = "POLITICA_DE_EXECUCAO" Then
    IdentifyTechnicalCode = "AP-VBS-PS-EXECUTION-POLICY-1"
  ElseIf processExitCode = 1 Then
    IdentifyTechnicalCode = "AP-VBS-PS-EXIT-1-NO-REPORT"
  Else
    IdentifyTechnicalCode = "AP-VBS-PS-EXIT-" & CStr(processExitCode) & "-NO-REPORT"
  End If
End Function

Function WriteFallbackReport(fileSystem, localRoot, failureClass, code, message, processExitCode)
  Dim folder, path, stem, suffix, stream, content, stage
  WriteFallbackReport = ""
  On Error Resume Next
  If localRoot = "" Or Not fileSystem.FolderExists(localRoot) Then Exit Function
  Set folder = fileSystem.GetFolder(localRoot)
  If (folder.Attributes And 1024) <> 0 Then Exit Function
  Randomize
  stem = "AmoresPet-Diagnostico-Migrations-Lote2-" & _
    Right("0000" & CStr(Year(Now)), 4) & Right("00" & CStr(Month(Now)), 2) & Right("00" & CStr(Day(Now)), 2) & "-" & _
    Right("00" & CStr(Hour(Now)), 2) & Right("00" & CStr(Minute(Now)), 2) & Right("00" & CStr(Second(Now)), 2)
  suffix = 0
  path = fileSystem.BuildPath(localRoot, stem & ".txt")
  Do While fileSystem.FileExists(path)
    suffix = suffix + 1
    path = fileSystem.BuildPath(localRoot, stem & "-" & CStr(suffix) & ".txt")
  Loop
  If failureClass = "PROCESSO" Then
    stage = "Inicializacao do processo PostgreSQL"
  ElseIf Left(code, Len("AP-PSQL-")) = "AP-PSQL-" Then
    stage = "Consulta SQL somente leitura; erro do psql classificado"
  ElseIf failureClass = "POLITICA_DE_EXECUCAO" Then
    stage = "Verificacao e inicializacao do auxiliar PowerShell"
  ElseIf Left(code, 12) = "AP-VBS-EXEC-" Then
    stage = "Inicializacao do processo PowerShell"
  ElseIf Left(code, Len("AP-VBS-PS-EXIT-1")) = "AP-VBS-PS-EXIT-1" Then
    stage = "Encerramento do auxiliar PowerShell sem relatorio proprio"
  ElseIf Left(code, 5) = "TEST-" Then
    stage = "Falha sintetica de teste do atalho"
  Else
    stage = "Inicializacao ou encerramento do auxiliar PowerShell"
  End If
  content = "Amores Pet - Diagnostico do auxiliar de migrations 036/037" & vbCrLf & _
    "Resultado: INCONCLUSIVO; estado das migrations NAO CONSULTADO" & vbCrLf & _
    "Categoria: " & SanitizeOutputText(failureClass) & vbCrLf & _
    "Etapa: " & stage & vbCrLf & _
    "Codigo tecnico: " & SanitizeOutputText(code) & vbCrLf & _
    "Codigo de saida: " & CStr(processExitCode) & vbCrLf & _
    "Mensagem sanitizada: " & SanitizeOutputText(message) & vbCrLf & _
    "Nenhuma migration foi executada por este relatorio de fallback." & vbCrLf
  Set stream = fileSystem.CreateTextFile(path, False, True)
  stream.Write content
  stream.Close
  If Err.Number = 0 And fileSystem.FileExists(path) Then WriteFallbackReport = path
  Err.Clear
  On Error GoTo 0
End Function

Sub OpenReport(processShell, fileSystem, path)
  Dim notepadPath
  notepadPath = processShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\notepad.exe"
  If fileSystem.FileExists(notepadPath) Then
    processShell.Run Chr(34) & notepadPath & Chr(34) & " " & Chr(34) & path & Chr(34), 1, True
  Else
    MsgBox "Relatorio sanitizado salvo localmente, mas o Notepad nao foi encontrado: " & SanitizeOutputText(path), vbExclamation, "Amores Pet - Diagnostico Lote 2"
  End If
End Sub

Function ReadSafeReport(fileSystem, filePath)
  Dim stream
  ReadSafeReport = ""
  On Error Resume Next
  Set stream = fileSystem.OpenTextFile(filePath, 1, False, -1)
  If Err.Number = 0 Then ReadSafeReport = SanitizeOutputText(stream.ReadAll)
  If Not stream Is Nothing Then stream.Close
  On Error GoTo 0
End Function

Function SanitizeOutputText(value)
  Dim text, regex
  text = Replace(Replace(Replace(CStr(value), vbCr, " "), vbLf, " | "), vbTab, " ")
  Set regex = New RegExp
  regex.Global = True
  regex.IgnoreCase = True
  regex.Pattern = "(password|senha|token|secret|segredo|credential|credencial)[ ]*[:=][ ]*[^ ,;|]+"
  text = regex.Replace(text, "$1=[redigido]")
  regex.Pattern = "postgres(ql)?://[^ ]+"
  text = regex.Replace(text, "postgres[redigido]")
  regex.Pattern = "[A-Za-z]:\\[^ ]+"
  text = regex.Replace(text, "[caminho local]")
  regex.Pattern = "DIAG_PRIVATE_PSQL_DETAIL=[^ |]+"
  text = regex.Replace(text, "[detalhe privado omitido]")
  regex.Pattern = "[A-Za-z0-9_-]{40,}"
  text = regex.Replace(text, "[redigido]")
  If Len(text) > 2200 Then text = Left(text, 2200) & " ... [saida limitada]"
  SanitizeOutputText = text
End Function
