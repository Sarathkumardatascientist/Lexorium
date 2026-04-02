Dim shell, fso, root, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c """ & root & "\start-lexorium.cmd"""
shell.Run command, 1, False
