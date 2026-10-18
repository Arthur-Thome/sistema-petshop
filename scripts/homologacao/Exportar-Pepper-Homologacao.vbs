Option Explicit
Dim shell, fso, scriptPath, powershellPath, command, exitCode
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Exportar-Pepper-Homologacao.ps1")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
If Not fso.FileExists(powershellPath) Or Not fso.FileExists(scriptPath) Then
  MsgBox "Windows PowerShell 5.1 ou o exportador nao foi encontrado.", vbExclamation, "Amores Pet - Exportar Pepper"
  WScript.Quit 2
End If
command = """" & powershellPath & """ -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File """ & scriptPath & """"
exitCode = shell.Run(command, 1, True)
WScript.Quit exitCode
