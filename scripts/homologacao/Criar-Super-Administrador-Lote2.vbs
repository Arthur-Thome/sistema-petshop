Option Explicit

Dim shell, fso, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Criar-Super-Administrador-Lote2.ps1")
command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File """ & scriptPath & """"
shell.Run command, 1, True
