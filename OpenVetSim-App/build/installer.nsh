; ============================================================================
; OpenVetSim -- custom NSIS installer fragments
; Included by electron-builder via nsis.include in package.json.
;
; What this does:
;   Install:   Creates %PUBLIC%\OpenVetSim\ and copies all web files
;              (sim-ii, sim-mgr, sim-ctl, sim-player, scenarios) there so
;              they are readable and writable by any Windows user account.
;              Also pre-creates the simlogs\video directory tree.
;              Places a shortcut on the All Users desktop (%PUBLIC%\Desktop).
;
;   Uninstall: Removes the installed web files from %PUBLIC%\OpenVetSim.
;              Prompts before deleting user-generated data (simlogs, scenarios).
;
; Note: the NSIS bundled with electron-builder does not resolve shell folder
; constants ($COMMONAPPDATA, $COMMONDESKTOP, etc.), so we use ReadEnvStr to
; read Windows environment variables directly instead.
;   %PUBLIC%  = C:\Users\Public  (All Users profile on Windows Vista+)
; ============================================================================

; == Install ==================================================================
!macro customInstall

  ReadEnvStr $R0 PUBLIC        ; e.g. C:\Users\Public

  ; Create the shared data root and log/video directories.
  CreateDirectory "$R0\OpenVetSim"
  CreateDirectory "$R0\OpenVetSim\simlogs"
  CreateDirectory "$R0\OpenVetSim\simlogs\video"

  ; Copy web application folders from the bundled resources into Public.
  ; xcopy /E = recurse subdirectories, /I = assume destination is a directory,
  ;       /Y = overwrite without prompt, /Q = quiet.
  ExecWait 'xcopy /E /I /Y /Q "$INSTDIR\resources\sim-ii"     "$R0\OpenVetSim\sim-ii"'
  ExecWait 'xcopy /E /I /Y /Q "$INSTDIR\resources\sim-mgr"    "$R0\OpenVetSim\sim-mgr"'
  ExecWait 'xcopy /E /I /Y /Q "$INSTDIR\resources\sim-ctl"    "$R0\OpenVetSim\sim-ctl"'
  ExecWait 'xcopy /E /I /Y /Q "$INSTDIR\resources\sim-player" "$R0\OpenVetSim\sim-player"'
  ExecWait 'xcopy /E /I /Y /Q "$INSTDIR\resources\scenarios"  "$R0\OpenVetSim\scenarios"'

  ; Create a shortcut on the All Users desktop so every account can find
  ; the scenarios folder easily.
  CreateShortCut "$R0\Desktop\OpenVetSim Scenarios.lnk" "$R0\OpenVetSim\scenarios"

!macroend

; == Uninstall ================================================================
!macro customUnInstall

  ReadEnvStr $R0 PUBLIC

  ; Remove the installed web application files.
  RMDir /r "$R0\OpenVetSim\sim-ii"
  RMDir /r "$R0\OpenVetSim\sim-mgr"
  RMDir /r "$R0\OpenVetSim\sim-ctl"
  RMDir /r "$R0\OpenVetSim\sim-player"

  ; Remove the desktop shortcut.
  Delete "$R0\Desktop\OpenVetSim Scenarios.lnk"

  ; Ask before deleting user-generated data (scenarios and session logs/videos).
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove simulation scenarios and session logs from $R0\OpenVetSim?$\n$\nChoose No to keep your recorded sessions and custom scenarios." \
    IDNO keepUserData

    RMDir /r "$R0\OpenVetSim\scenarios"
    RMDir /r "$R0\OpenVetSim\simlogs"
    RMDir    "$R0\OpenVetSim"   ; removes dir only if now empty

  keepUserData:

!macroend
