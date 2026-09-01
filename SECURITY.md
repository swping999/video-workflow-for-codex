# Security policy

## Private media

Do not commit voice samples, face or identity references, private scripts, API keys, access tokens, or generated media that you do not have permission to share. The repository intentionally ships without a presenter image or voice reference.

Keep generated episodes outside the repository or in an ignored `episodes/` directory. Review `git status` before every push.

## Voice and likeness

Only use a voice recording when you have the speaker's authorization. Only use a person's likeness when you have permission to do so. The workflow accepts authorized local audio files but does not bundle a cloning model, biometric reference, paid-service adapter, or cloud credential.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for path traversal, unintended media disclosure, command injection, unsafe archive handling, or credential exposure. Do not include real secrets or private media in a report.
