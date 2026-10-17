Option Explicit
Dim shell, fso, base, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & base & "\Ver-Credenciais-Amores-Pet.ps1"""
shell.Run command, 0, False
