Option Explicit
Dim shell, fso, base, scriptPath, powershellPath, command, windowStyle, exitCode, selfTest
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = fso.BuildPath(base, "Iniciar-Neon-Homologacao.ps1")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
If Not fso.FileExists(powershellPath) Or Not fso.FileExists(scriptPath) Then
  MsgBox "Windows PowerShell 5.1 ou o script do launcher nao foi encontrado.", vbExclamation, "Amores Pet - Homologacao Neon"
  WScript.Quit 2
End If

selfTest = False
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments.Count = 1 And LCase(WScript.Arguments(0)) = "--self-test" Then
    selfTest = True
  Else
    MsgBox "Argumento invalido. Use somente --self-test para a verificacao sem conexao.", vbExclamation, "Amores Pet - Homologacao Neon"
    WScript.Quit 2
  End If
End If

command = """" & powershellPath & """ -NoProfile -ExecutionPolicy Bypass -File """ & scriptPath & """"
windowStyle = 1
If selfTest Then
  command = command & " -SelfTestOnly"
  windowStyle = 0
End If
exitCode = shell.Run(command, windowStyle, True)
If selfTest Then
  If exitCode = 0 Then
    WScript.Echo "VBS_LAUNCHER_SELF_TEST=APROVADO"
  Else
    WScript.Echo "VBS_LAUNCHER_SELF_TEST=FALHOU; CODIGO=" & CStr(exitCode)
  End If
End If
WScript.Quit exitCode
