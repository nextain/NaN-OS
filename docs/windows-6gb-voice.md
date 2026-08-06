# Windows local voice (VRAM 6GB+)

> Active contract: 2026-08-06. This replaces the retired
> `windows-voice-6g`/`windows_trt_6g` hardware-profile UX and its Naia-login
> gate. Historical TensorRT measurements remain evidence only.

## Product contract

- There is no separate Local GPU Profile selector.
- GPU detection is capability discovery only. It never changes the LLM, TTS
  provider, avatar, or enabled state.
- When detected VRAM is at least 6GB, Voice settings show one explicit
  `voxCPM 2 local voice` ON/OFF control.
- Local voice does not require Naia login and is independent of VRM/NVA.
- ON starts the packaged Windows voice child and becomes ready only after the
  public voice façade at `http://localhost:8910` is healthy.
- OFF stops the owned process tree and clears ready/starting/error state.
- Voice settings own reference voice selection, recording, and file upload.
- LLM provider/model/host and avatar provider/asset must survive every voice
  transition and application restart unchanged.

## UI states

| State | UI | Runtime |
|---|---|---|
| VRAM unknown or below 6GB | control unavailable with a plain capability explanation | no start call |
| Available, OFF | toggle off; reference controls may remain configured | no owned voice child |
| Starting | bounded progress and cancel/off action | spawn child, poll :8910 health |
| Ready | toggle on and ready status | :8910 health confirmed |
| Failed | actionable localized error and retry | failed child reaped; never report ready |
| Stopping | bounded progress | terminate/reap owned process tree |

The message “로컬 음성 엔진에 연결할 수 없습니다” must identify whether the
failure was spawn, early exit, readiness timeout, or an invalid host. A saved
provider value alone is not evidence that the engine is running.

## Migration

- Retire `windows-voice-6g`, `windows_trt_6g`, local GPU tier/profile, and
  account-gated cascade fields as UI/runtime authorities.
- Preserve a user-selected reference voice and explicit local-voice enabled
  state only when the new schema can represent them.
- Never migrate a detected/recommended tier into enabled=true.
- Do not change LLM or avatar fields while migrating voice configuration.

## Verification

1. Unit: 5.9GB/6.0GB/unknown gates; detection does not enable or start.
2. Component: no-login toggle, reference select/record/upload, localized
   starting/ready/error/off states.
3. Rust: spawn, early exit, health timeout, ready, stop, process-tree reap.
4. Migration: legacy hardware profile maps without enabling local voice and
   preserves LLM/avatar settings.
5. Native Windows: OFF → ON → :8910 ready → synthesis → OFF, followed by an
   orphan-process check and restart round-trip.

NVA is a separate pre-authored web-player feature. It neither consumes this
GPU capability nor proves local voice readiness.
