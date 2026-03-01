#!/bin/sh
# Set fcitx5 as default input method for Korean input support
#
# GTK_IM_MODULE and QT_IM_MODULE are set unconditionally (including Wayland).
# While upstream docs suggest omitting them on Wayland, in practice terminals
# (Konsole, Ptyxis) require them for proper Korean character composition.

export INPUT_METHOD=fcitx
export XMODIFIERS=@im=fcitx
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export SDL_IM_MODULE=fcitx
export GLFW_IM_MODULE=fcitx
