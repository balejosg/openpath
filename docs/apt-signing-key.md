# Persistent APT Signing Key

OpenPath APT publishes must reuse a single repository signing key. Ephemeral keys break existing machines because `apt update` fails after the repository fingerprint changes.

## Secret bootstrap

Generate a dedicated key on a maintainer machine:

```bash
export GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"

cat > /tmp/openpath-apt-gpg-batch.txt <<'EOF'
%no-protection
Key-Type: RSA
Key-Length: 4096
Name-Real: OpenPath System APT
Name-Email: apt@openpath.local
Expire-Date: 5y
%commit
EOF

gpg --batch --gen-key /tmp/openpath-apt-gpg-batch.txt
gpg --armor --export-secret-keys 'OpenPath System APT <apt@openpath.local>' > /tmp/openpath-apt-private.asc
gpg --armor --export 'OpenPath System APT <apt@openpath.local>' > /tmp/openpath-apt-public.asc
```

Install the private key as the GitHub Actions secret used by both publish workflows:

```bash
gh secret set APT_GPG_PRIVATE_KEY --repo balejosg/openpath < /tmp/openpath-apt-private.asc
gh secret list --repo balejosg/openpath
```

After the secret is present, republish `stable` once. The workflow re-signs both `stable` and `unstable`, so both suites move to the persistent fingerprint during that publish.

## Intentional rotation

If rotation is required:

1. Generate the replacement key.
2. Update `APT_GPG_PRIVATE_KEY`.
3. Republish `stable` to re-sign both suites and refresh `pubkey.gpg`.
4. Announce the new fingerprint to operators before any managed fleet rollout.
