# Naia OS E2E Installation Kickstart
# Unattended install for QEMU VM testing
# Usage: injected into ISO via e2e-install.sh

# Locale & keyboard
lang en_US.UTF-8
keyboard us
timezone UTC --utc

# Root & user (both required for complete spokes)
rootpw --lock
user --name=testuser --password=naia-e2e-test --plaintext --groups=wheel --gecos="E2E Test User"

# Network
network --bootproto=dhcp --device=link --activate --hostname=naia-e2e

# Disk
ignoredisk --only-use=vda
zerombr
clearpart --all --initlabel --drives=vda
reqpart --add-boot
autopart --type=btrfs

# Bootloader
bootloader --timeout=1

# Misc
firstboot --disable
selinux --permissive
reboot

%post --erroronfail --log=/var/log/naia-e2e-post.log
systemctl enable sshd.service
mkdir -p /home/testuser/.ssh
chmod 700 /home/testuser/.ssh
chown testuser:testuser /home/testuser/.ssh

# ostreecontainer + bootc switch handle kernel/boot setup automatically.
# No manual kernel-install needed.

echo "NAIA_E2E_INSTALL_COMPLETE=$(date -Iseconds)" > /var/log/naia-e2e-marker
%end
