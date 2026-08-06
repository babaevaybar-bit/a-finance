# Support Playbook Template

Use this reference when adapting `customer-support-reply-en` to a specific company, product, or support team. Do not treat blank template fields as facts; use them only when the user provides concrete policy or tone guidance.

## Brand Voice

- Warmth:
- Formality:
- Brevity:
- Terms to prefer:
- Terms to avoid:
- Signature style:

## Policy Boundaries

### Refunds and Credits

- When support can approve:
- When manager approval is required:
- Maximum amount, period, or count:
- Required evidence:
- Phrases to avoid:

### SLA and Timelines

- First response:
- Engineering escalation:
- Billing escalation:
- Incident update cadence:
- Do not promise:

### Account and Security

- Information support may request:
- Information support must never request:
- Identity verification requirements:
- Security escalation triggers:

## Escalation Matrix

| Scenario | Escalate To | Required Context | Customer Promise |
|---|---|---|---|
| Data loss | Engineering / Incident Response | Account, timestamps, affected data | Acknowledge and provide update cadence |
| Suspected fraud | Trust & Safety / Billing | Transaction IDs, account email | Avoid outcome promises |
| Angry VIP customer | Customer Success Lead | Account owner, contract tier, issue summary | Confirm ownership |
| Legal or compliance threat | Legal / Compliance | Exact message, jurisdiction if known | Do not debate legal claims |
| Repeated bug | Product / Engineering | Repro steps, logs, screenshots | Share workaround if available |

## Reusable Templates

### Standard Resolution

Hi [Name],

Thanks for reaching out. I understand [specific issue]. [Direct answer or fix].

Please [next step]. If this does not resolve it, reply here with [specific information], and we’ll take another look.

Best,
[Agent]

### Needs More Information

Hi [Name],

Thanks for flagging this. I want to make sure we look at the right issue. Could you send [specific missing details]?

Once we have that, we can [next action].

Best,
[Agent]

### Escalation

Hi [Name],

Thanks for raising this. I understand how [impact] affects you. I’m escalating this to [team] so they can review [specific concern].

We’ll update you [timeline if policy-backed, otherwise “as soon as we have more information”]. In the meantime, [workaround or safe next step if available].

Best,
[Agent]

### Feature Request

Hi [Name],

Thanks for sharing this use case. I can see how [feature/request] would help with [customer goal].

I’ll pass this feedback to the product team. I can’t promise a timeline, but your context helps us understand the need. For now, [workaround if available].

Best,
[Agent]
