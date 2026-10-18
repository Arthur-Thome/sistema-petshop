Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, exitCode
Dim plan, policyDetail, failure
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\Inventariar-Homologacao-Neon.ps1"
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If Not fso.FileExists(scriptPath) Then
  MsgBox "O auxiliar de inventario nao foi encontrado. Nenhum banco foi consultado.", vbExclamation, "Amores Pet - Inventario Neon"
  WScript.Quit 2
End If
If Not fso.FileExists(powershellPath) Then
  MsgBox "Windows PowerShell 5.1 nao foi encontrado. Nenhum banco foi consultado.", vbExclamation, "Amores Pet - Inventario Neon"
  WScript.Quit 2
End If

plan = GetExecutionPolicyPlan(powershellPath, policyDetail)
If WScript.Arguments.Named.Exists("testarPolitica") Then
  WScript.Echo "POLITICA_PROCESSO=" & plan
  WScript.Echo "ESCOPOS_PERSISTENTES_ALTERADOS=NAO"
  WScript.Quit 0
End If
If Left(plan, 8) = "BLOCKED:" Then
  MsgBox "A politica de execucao configurada bloqueia o auxiliar. Nenhuma politica foi alterada e nenhum banco foi consultado. " & policyDetail, vbExclamation, "Amores Pet - Inventario Neon"
  WScript.Quit 1
ElseIf plan = "ERROR" Then
  MsgBox "Nao foi possivel validar a politica de execucao. Nenhuma politica foi alterada e nenhum banco foi consultado.", vbExclamation, "Amores Pet - Inventario Neon"
  WScript.Quit 2
End If

' No estado padrao do Windows (todos os escopos Undefined), usa RemoteSigned
' somente no processo filho. Nenhum escopo persistente e alterado; Bypass nunca e usado.
If plan = "REMOTE_SIGNED_DEFAULT_PROCESS" Then
  command = Chr(34) & powershellPath & Chr(34) & " -NoExit -NoProfile -ExecutionPolicy RemoteSigned -File " & Chr(34) & scriptPath & Chr(34)
Else
  command = Chr(34) & powershellPath & Chr(34) & " -NoExit -NoProfile -File " & Chr(34) & scriptPath & Chr(34)
End If
On Error Resume Next
exitCode = shell.Run(command, 1, True)
If Err.Number <> 0 Then
  failure = Err.Number
  Err.Clear
  On Error GoTo 0
  MsgBox "Nao foi possivel abrir o inventario local (codigo " & CStr(failure) & "). Nenhum banco foi alterado.", vbExclamation, "Amores Pet - Inventario Neon"
  WScript.Quit 2
End If
On Error GoTo 0

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
      detail = "Politica efetiva: " & effective & "; escopos persistentes consultados sem alteracao."
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
