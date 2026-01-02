Set WshShell = CreateObject("WScript.Shell")
' Run the loop runner in the background (0 = hide window)
' We use 'cmd /c' to run the npm command
WshShell.Run "cmd /c npm run loop:headless", 0
Set WshShell = Nothing
