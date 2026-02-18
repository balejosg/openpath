# How-To Guide: OpenPath DNS System

## Quick Start

### Install on a Single PC

```bash
curl -fsSL https://balejosg.github.io/openpath/apt/apt-bootstrap.sh | sudo bash
```

The bootstrap installs OpenPath and launches `openpath setup` (classroom wizard).

---

## Configure After Installation

### Classroom Setup (Recommended)

```bash
sudo openpath setup
```

The wizard asks for API URL, classroom name, and registration token.

### Change Whitelist URL

```bash
echo "https://your-url.com/whitelist.txt" | sudo tee /etc/openpath/whitelist-url.conf
sudo openpath update
```

### Use Interactive Configuration

```bash
sudo dpkg-reconfigure openpath-dnsmasq
```

---

## Deploy to Multiple PCs (Classroom Setup)

### Option 1: One-liner via SSH

```bash
ssh user@pc-01 "curl -fsSL https://balejosg.github.io/openpath/apt/apt-bootstrap.sh | sudo bash"
```

### Option 2: Ansible Playbook

```yaml
# openpath-install.yml
- hosts: classroom_pcs
  become: yes
  tasks:
    - name: Add GPG key
      apt_key:
        url: https://balejosg.github.io/openpath/apt/pubkey.gpg
        keyring: /usr/share/keyrings/openpath.gpg

    - name: Add APT repository
      apt_repository:
        repo: 'deb [signed-by=/usr/share/keyrings/openpath.gpg] https://balejosg.github.io/openpath/apt stable main'
        filename: openpath

    - name: Install openpath-dnsmasq
      apt:
        name: openpath-dnsmasq
        state: present
        update_cache: yes

    - name: Set whitelist URL
      copy:
        content: 'https://your-url.com/whitelist.txt'
        dest: /etc/openpath/whitelist-url.conf

    - name: Apply configuration
      command: openpath update
```

Run with:

```bash
ansible-playbook -i inventory.ini openpath-install.yml
```

---

## Common Tasks

### Check System Status

```bash
openpath status
```

### Test DNS Resolution

```bash
openpath test
```

### Force Whitelist Update

```bash
sudo openpath update
```

### View Logs

```bash
sudo journalctl -u dnsmasq -f
sudo tail -f /var/log/openpath.log
```

### Temporarily Disable (Fail-open)

Add `# DESACTIVADO` as the first line of your remote whitelist file.
The system will automatically enter fail-open mode.

---

## Troubleshooting

### DNS Not Resolving

```bash
# Check dnsmasq status
sudo systemctl status dnsmasq

# Check port 53
sudo ss -ulnp | grep :53

# Verify resolv.conf
cat /etc/resolv.conf
```

### Firewall Blocking Everything

```bash
# Check firewall rules
sudo iptables -L OUTPUT -n

# Temporarily disable
sudo iptables -P OUTPUT ACCEPT
```

### Whitelist Not Updating

```bash
# Check timer status
systemctl status openpath-dnsmasq.timer

# Manual update
sudo /usr/local/bin/openpath-update.sh
```

---

## Configuration Files

| File                                   | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `/etc/openpath/whitelist-url.conf`     | URL to fetch whitelist from    |
| `/etc/openpath/health-api-url.conf`    | Health API endpoint (optional) |
| `/etc/openpath/health-api-secret.conf` | Health API secret (optional)   |
| `/var/lib/openpath/whitelist.txt`      | Downloaded whitelist (cache)   |
| `/etc/dnsmasq.d/openpath.conf`         | dnsmasq configuration          |

---

## Update to Latest Version

```bash
sudo apt update
sudo apt upgrade openpath-dnsmasq
```

---

## Uninstall

### Keep configuration (can reinstall later)

```bash
sudo apt remove openpath-dnsmasq
```

### Complete removal

```bash
sudo apt purge openpath-dnsmasq
```

---

## APT Repository Details

- **URL**: https://balejosg.github.io/openpath/apt/
- **Distribution**: stable
- **Component**: main
- **Architecture**: amd64
- **GPG Key**: https://balejosg.github.io/openpath/apt/pubkey.gpg
