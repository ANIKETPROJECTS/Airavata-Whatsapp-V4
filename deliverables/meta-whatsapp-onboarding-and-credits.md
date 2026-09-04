# Meta WhatsApp Onboarding and Airavata Credits

## Why onboarding can be blocked

Meta business verification and Meta payment-card approval are separate checks.

AutoGamma's business can be fully verified while Meta still rejects the payment card because of:

- Bank or country restrictions
- International or recurring payments being disabled
- 3-D Secure or payment authentication failure
- A prepaid, virtual, or unsupported card type
- A billing address or business-detail mismatch
- An existing unpaid Meta balance
- A payment account or Business Manager restriction
- A currency or billing-country mismatch
- Meta requiring a payment method for WhatsApp Business messaging limits

Airavata cannot bypass this validation because it happens inside Meta's Embedded Signup and billing system. If Meta rejects the card before signup completes, the Embedded Signup process usually does not reach the successful **FINISH** event, so Airavata does not receive the WABA and phone-number details.

## What happens after Meta accepts the card

The current Airavata flow is designed for the AutoGamma setup:

1. AutoGamma logs into its Airavata account.
2. AutoGamma selects **Connect Facebook** or **Embedded Signup**.
3. Meta handles business selection, WABA creation or selection, phone-number selection, payment setup, and permissions.
4. Meta sends Airavata an authorization code.
5. Airavata exchanges the code with Meta.
6. Airavata receives the WABA ID, Phone Number ID, and WhatsApp access token.
7. Airavata encrypts and stores the access token against AutoGamma's user account.
8. The account is marked connected only after the encrypted credentials are saved successfully.

The connection is tenant-specific, so AutoGamma's WhatsApp credentials are not mixed with another client's credentials.

## Which account sends the messages?

After onboarding, ordinary client accounts send messages through the credentials stored for that specific client:

- AutoGamma's WABA
- AutoGamma's Phone Number ID
- AutoGamma's Meta access token

The webhook also identifies the owning client from the Meta Phone Number ID, allowing incoming messages and delivery updates to be associated with the correct client workspace.

## How Admin-assigned credits work

When Master Admin gives AutoGamma credits:

- AutoGamma's internal credit balance increases.
- A credit transaction is recorded.
- Template messages check the available balance before sending.
- Credits are reserved before Airavata calls Meta.
- If Meta rejects the message, the reserved credits are refunded.
- If the message succeeds, a deduction transaction is recorded.

### Current credit rules

| Message type | Airavata credit behavior |
|---|---|
| Marketing template | Uses the configured Marketing rate |
| Utility template | Uses the configured Utility rate |
| Authentication template | Uses the configured Authentication rate |
| Normal free-form session message | Not charged Airavata credits |

## Important distinction: Meta billing vs Airavata credits

Airavata credits and Meta billing are separate systems.

**Airavata credits** control usage inside the Airavata platform. They do not replace Meta's requirement for an accepted payment method.

Therefore AutoGamma may need both:

1. An accepted payment method in Meta for WhatsApp Business billing and account activation requirements.
2. Credits assigned by Master Admin for Airavata's internal message-credit rules.

The Meta card is used for Meta's own billing and account rules. The credits assigned in Airavata are used for Airavata's platform controls.

## How to locate the failure

When AutoGamma retries onboarding, check these checkpoints in order:

1. The Embedded Signup window reaches Meta's successful completion step.
2. Browser logs show the Embedded Signup **FINISH** event.
3. The API logs a successful Meta authorization-code exchange.
4. The API logs that encrypted WhatsApp credentials were stored.
5. AutoGamma's account shows Connected status, a WABA ID, and a Phone Number ID.
6. A test message is sent from AutoGamma's WhatsApp number, not the ecosystem or administrator number.

If Meta rejects the card before the **FINISH** event, the failure is on Meta's billing or payment side. No WABA credentials will be stored by Airavata until the Meta onboarding flow completes successfully.

## Conclusion

The card rejection is not caused by AutoGamma's business-verification status and is not something Airavata can override. Once Meta accepts the payment method and Embedded Signup completes, the existing Airavata design stores AutoGamma's connection separately, sends through AutoGamma's business account, and applies the credits assigned by Master Admin according to the configured message category rates.