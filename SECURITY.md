# Security

Please report a security problem privately to **contact@satelit.md**. Do not open a public issue for it.

Include what you found, how to reproduce it and which example it touches. We answer every report.

## Keys

Every example reads the API key from the `SATELIT_API_KEY` environment variable (or a secret store: Script Properties,
GitHub Actions secrets). None of them prints, logs or caches the key. If you leaked a key, revoke it in the
[console](https://developer.satelit.md/en/console/) and make a new one.
