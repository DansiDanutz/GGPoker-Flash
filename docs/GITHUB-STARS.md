# Voluntary OpenPoker stars

The yellow star in News from Dan asks whether the visitor wants to star
`OpenPoker4all/OpenPoker`. No thanks and Escape dismiss it without contacting
GitHub. Yes starts GitHub App user authorization with account selection. Only a
confirmed `204` from GitHub's star endpoint produces the success page. Repeating
the flow keeps an existing star; it cannot create multiple stars from one account.

The private `DansiDanutz/DanGG` repository is never the star target.

## Operator setup

Register a **GitHub App**, not a classic OAuth App:

- Name: `DanGG OpenPoker Stars` (choose an available equivalent if needed).
- Homepage: `https://dangg.live`.
- Callback: `https://dangg.live/api/github-star/callback`.
- User permission: **Starring — Read and write**.
- Repository permission: **Metadata — Read-only**. Do not request code access.
- Allow authorization by other GitHub accounts. Keep user token expiration on.
- No device flow or webhook delivery is needed; no visitor tokens are retained.
- Ensure the app can access the public OpenPoker repository under GitHub's
  installation/authorization rules before enabling production.

Configure these values in the protected deployment `.env`, never in source,
browser bundles, screenshots or chat:

```dotenv
GITHUB_STAR_CLIENT_ID=<GitHub App client ID>
GITHUB_STAR_CLIENT_SECRET=<GitHub App client secret>
GITHUB_STAR_ORIGIN=https://dangg.live
```

Use the canonical origin for authorization. The existing deployment compose
configuration already loads `.env`. Release through the standard approved
public-main deployment process after configuration. Missing configuration leaves
automatic authorization unavailable and shows a direct GitHub link as a fallback.

Before calling the integration live, explicitly authorize with a test account,
confirm GitHub reports the star, decline in another flow, and verify that no
credentials appear in logs. Local tests mock GitHub and never star a repository.

## Security and operations

Consent requests require same-origin JSON POST, are rate-limited and bind a
random one-use state to an HttpOnly, Secure, SameSite cookie. PKCE binds the code
exchange. State expires after ten minutes and is bounded to 1,000 pending flows.
A server restart expires pending flows; the visitor can start again. Provider
errors never become a claimed success. Tokens remain only in the callback's
memory and are not saved or refreshed. Visitors can revoke the GitHub App grant
from their GitHub settings.

References: [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
and [GitHub starring API](https://docs.github.com/en/rest/activity/starring#star-a-repository-for-the-authenticated-user).
