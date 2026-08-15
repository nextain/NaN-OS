; A full uninstall is a clean application reinstall boundary. Updates pass
; /UPDATE and preserve state. User ADK/workspace files are outside BUNDLEID.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    StrCpy $DeleteAppDataCheckboxState 1
  ${EndIf}
!macroend
