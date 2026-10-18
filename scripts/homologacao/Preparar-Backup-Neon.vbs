Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, exitCode
Dim policyPlan, policyDetail
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\Preparar-Backup-Neon.ps1"
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If Not fso.FileExists(scriptPath) Then
  MsgBox "O executor de backup Neon nao foi encontrado. Nenhuma conexao foi iniciada.", vbExclamation, "Amores Pet - Backup Neon"
  WScript.Quit 2
End If
If Not fso.FileExists(powershellPath) Then
  MsgBox "Windows PowerShell 5.1 nao foi encontrado. Nenhuma conexao foi iniciada.", vbExclamation, "Amores Pet - Backup Neon"
  WScript.Quit 2
End If

policyPlan = GetExecutionPolicyPlan(powershellPath, policyDetail)
If WScript.Arguments.Named.Exists("testarPolitica") Then
  WScript.Echo "POLITICA_PROCESSO=" & policyPlan
  WScript.Echo "ESCOPOS_PERSISTENTES_ALTERADOS=NAO"
  WScript.Quit 0
End If
If Left(policyPlan, 8) = "BLOCKED:" Then
  MsgBox "Codigo: AP-NEON-VBS-EXEC-POLICY-" & Mid(policyPlan, 9) & vbCrLf & _
    "A politica de execucao restringe o executor. Nenhuma politica foi alterada e nenhum banco foi consultado.", _
    vbExclamation, "Amores Pet - Backup Neon"
  WScript.Quit 1
ElseIf policyPlan = "ERROR" Then
  MsgBox "Codigo: AP-NEON-VBS-POLICY-CHECK. Nao foi possivel validar a politica de execucao; o executor nao foi iniciado.", _
    vbExclamation, "Amores Pet - Backup Neon"
  WScript.Quit 2
ElseIf policyPlan = "REMOTE_SIGNED_DEFAULT_PROCESS" Then
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy RemoteSigned -File " & Chr(34) & scriptPath & Chr(34)
Else
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -File " & Chr(34) & scriptPath & Chr(34)
End If

On Error Resume Next
exitCode = shell.Run(command, 1, True)
If Err.Number <> 0 Then
  Dim launchError
  launchError = Err.Number
  Err.Clear
  On Error GoTo 0
  MsgBox "Codigo: AP-NEON-VBS-LAUNCH; o PowerShell nao foi iniciado (" & CStr(launchError) & "). Nenhuma importacao foi executada.", _
    vbExclamation, "Amores Pet - Backup Neon"
  WScript.Quit 3
End If
On Error GoTo 0

If exitCode <> 0 Then
  MsgBox "Preparacao interrompida (PowerShell exit " & CStr(exitCode) & "). Consulte a etapa e o relatorio sanitizado exibidos no console. Nenhuma importacao para Neon foi iniciada.", _
    vbExclamation, "Amores Pet - Backup Neon"
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
