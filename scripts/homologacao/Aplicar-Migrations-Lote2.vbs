Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, exitCode
Dim policyPlan, policyDetail, launcherPolicyMode, startedAt, safeReportPath
Dim localAppData, reportRoot
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = base & "\Aplicar-Migrations-Lote2.ps1"
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
reportRoot = localAppData & "\AmoresPet\Homologacao\migration-backups"
startedAt = Now

If Not fso.FileExists(scriptPath) Then
  MsgBox "PowerShell executor not found. Nenhuma conexao ou alteracao foi iniciada.", vbExclamation, "Amores Pet - Lote 2"
  WScript.Quit 2
End If
If Not fso.FileExists(powershellPath) Then
  MsgBox "Windows PowerShell nao foi encontrado. Nenhuma conexao ou alteracao foi iniciada.", vbExclamation, "Amores Pet - Lote 2"
  WScript.Quit 3
End If

policyPlan = GetExecutionPolicyPlan(powershellPath, policyDetail)
If Left(policyPlan, 8) = "BLOCKED:" Then
  MsgBox "Codigo: AP-VBS-EXEC-POLICY-" & Mid(policyPlan, 9) & vbCrLf & _
    "Politica de execucao explicitamente restritiva: " & Mid(policyPlan, 9) & "." & vbCrLf & _
    "O aplicador nao foi iniciado, nenhum backup foi criado e nenhum banco foi alterado.", _
    vbExclamation, "Amores Pet - Lote 2"
  WScript.Quit 1
ElseIf policyPlan = "ERROR" Then
  MsgBox "Codigo: AP-VBS-EXEC-POLICY-CHECK" & vbCrLf & _
    "Nao foi possivel verificar a politica de execucao com seguranca. O aplicador nao foi iniciado; nenhum banco foi alterado.", _
    vbExclamation, "Amores Pet - Lote 2"
  WScript.Quit 2
ElseIf policyPlan = "REMOTE_SIGNED_DEFAULT_PROCESS" Then
  launcherPolicyMode = "REMOTE_SIGNED_DEFAULT_PROCESS"
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -ExecutionPolicy RemoteSigned -File " & Chr(34) & scriptPath & Chr(34)
Else
  launcherPolicyMode = "EXISTING_POLICY"
  command = Chr(34) & powershellPath & Chr(34) & " -NoProfile -File " & Chr(34) & scriptPath & Chr(34)
End If

' RemoteSigned e aplicado somente ao processo quando todos os escopos persistentes estao Undefined.
' Politicas explicitas Restricted/AllSigned sao bloqueadas acima; nenhuma politica persistente e alterada.
command = command & " -LauncherPolicyMode " & launcherPolicyMode
exitCode = shell.Run(command, 1, True)
safeReportPath = FindLatestSafeReport(fso, reportRoot, startedAt)

If safeReportPath <> "" Then
  Call OpenSafeReport(shell, fso, safeReportPath)
Else
  MsgBox "Codigo: AP-VBS-REPORT-MISSING; PowerShell exit " & CStr(exitCode) & vbCrLf & _
    "O PowerShell terminou sem relatorio sanitizado desta execucao." & vbCrLf & _
    "Etapa e estado das migrations: INCONCLUSIVOS. Nao execute novamente o aplicador ate confirmar o estado por diagnostico somente leitura.", _
    vbExclamation, "Amores Pet - Lote 2"
End If
If exitCode <> 0 And safeReportPath <> "" Then
  MsgBox "Aplicador interrompido (codigo " & CStr(exitCode) & "). O relatorio sanitizado foi aberto; siga a etapa e o estado registrados nele.", _
    vbExclamation, "Amores Pet - Lote 2"
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
  Dim policyCommand, outputText, errorText, launchFailure, resultCode, lines, line, fields, effective
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
      detail = "Politica efetiva: " & effective & "; escopos persistentes foram lidos sem alteracao."
      GetExecutionPolicyPlan = ClassifyExecutionPolicy(effective, fields)
      Exit Function
    End If
  Next
End Function

Function ClassifyExecutionPolicy(effective, scopeValues)
  Dim allUndefined, index
  allUndefined = True
  For index = 1 To UBound(scopeValues)
    If UCase(Trim(CStr(scopeValues(index)))) <> "UNDEFINED" Then allUndefined = False
  Next
  If allUndefined And UCase(Trim(CStr(effective))) = "RESTRICTED" Then
    ClassifyExecutionPolicy = "REMOTE_SIGNED_DEFAULT_PROCESS"
  ElseIf UCase(Trim(CStr(effective))) = "RESTRICTED" Or UCase(Trim(CStr(effective))) = "ALLSIGNED" Then
    ClassifyExecutionPolicy = "BLOCKED:" & UCase(Trim(CStr(effective)))
  Else
    ClassifyExecutionPolicy = "EXISTING_POLICY"
  End If
End Function

Function FindLatestSafeReport(fileSystem, folderPath, threshold)
  Dim root, folder, reportFile, candidate, bestPath, bestModified, regex
  FindLatestSafeReport = ""
  bestPath = ""
  bestModified = #1/1/1900#
  On Error Resume Next
  If Not fileSystem.FolderExists(folderPath) Then Exit Function
  Set root = fileSystem.GetFolder(folderPath)
  If (root.Attributes And 1024) <> 0 Then Exit Function
  Set regex = New RegExp
  regex.IgnoreCase = True
  regex.Global = False
  regex.Pattern = "^migrations-036-037-[0-9]{8}-[0-9]{6}-[a-f0-9]{32}$"
  For Each folder In root.SubFolders
    If regex.Test(folder.Name) And (folder.Attributes And 1024) = 0 Then
      If folder.DateCreated >= DateAdd("s", -5, threshold) Then
        candidate = fileSystem.BuildPath(folder.Path, "relatorio-sanitizado.txt")
        If fileSystem.FileExists(candidate) Then
          Set reportFile = fileSystem.GetFile(candidate)
          If (reportFile.Attributes And 1026) = 0 And reportFile.Size <= 16000 Then
            If reportFile.DateLastModified >= bestModified Then
              bestModified = reportFile.DateLastModified
              bestPath = candidate
            End If
          End If
        End If
      End If
    End If
  Next
  On Error GoTo 0
  FindLatestSafeReport = bestPath
End Function

Sub OpenSafeReport(processShell, fileSystem, path)
  Dim notepadPath
  notepadPath = processShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\notepad.exe"
  If fileSystem.FileExists(notepadPath) Then
    processShell.Run Chr(34) & notepadPath & Chr(34) & " " & Chr(34) & path & Chr(34), 1, True
  Else
    MsgBox "Relatorio sanitizado salvo localmente, mas o Notepad nao foi encontrado. O resultado permanece no arquivo local.", _
      vbExclamation, "Amores Pet - Lote 2"
  End If
End Sub
