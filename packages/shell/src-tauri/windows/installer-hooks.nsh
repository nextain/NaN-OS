; A full uninstall is a clean application reinstall boundary. Updates pass
; /UPDATE and preserve state. User ADK/workspace files are outside BUNDLEID.
!macro NSIS_HOOK_PREINSTALL
  ; Installer-owned dependency trees can contain files introduced by an older
  ; release that NSIS no longer knows how to remove. Replace these trees as a
  ; unit so an update cannot run a stale Agent or stale node_modules package.
  RMDir /r "$INSTDIR\agent"
  RMDir /r "$INSTDIR\assets"
  RMDir /r "$INSTDIR\bgm-sidecar"
  RMDir /r "$INSTDIR\cascade-loader"
  RMDir /r "$INSTDIR\cascade-runtime"
  RMDir /r "$INSTDIR\herdr"
  RMDir /r "$INSTDIR\voxcpm2-runtime"
  RMDir /r "$INSTDIR\~"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    StrCpy $DeleteAppDataCheckboxState 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ; Tauri removes tracked files first. Remove only the exact Naia install
    ; root afterward so untracked dependency residue cannot survive a full
    ; uninstall. ~/.naia and user workspaces are deliberately outside it.
    RMDir /r "$INSTDIR"
  ${EndIf}
!macroend
