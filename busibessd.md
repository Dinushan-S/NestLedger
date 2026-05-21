# NestLedger Business Perspective Audit

Date: 2026-05-17
Status: Pre-release review after latest main changes, including multi-currency support

## Business Verdict

NestLedger is now a stronger MVP and closer to a release candidate, but it is still not ready for public production.

The new multi-currency support is a meaningful business improvement. Earlier, the product was easier to position as an LKR-first household finance app. Now it can support a broader household market: Sri Lanka, expat families, students, shared homes, and international households that do not use LKR.

That improves the product opportunity, but it also increases the testing responsibility. Currency touches every money workflow: budgets, expenses, shopping-linked expenses, bills, savings, notifications, and summaries. A currency display bug is not cosmetic in a finance app. It directly affects user trust.

Current decision: **controlled beta after full P0 regression**, not public production.

## What Changed In The Latest Main Code

Latest main includes multi-currency support.

Business impact:

- Better global positioning beyond only Sri Lankan households.
- Stronger onboarding because users can choose their own currency.
- Better fit for expat families, roommates, and cross-country households.
- Higher trust if all money screens display one consistent currency.

New business risk:

- Currency must be tested across all P0 money flows before release.
- Users may lose trust quickly if one screen shows USD while another shows LKR/Rs.
- Zero-decimal currencies and symbol display need review.
- App store copy should avoid claiming automatic exchange-rate conversion unless the app actually supports conversion.

## Updated Positioning

Do not position NestLedger as a generic expense tracker.

Recommended positioning:

> A shared household finance app for families and roommates to manage budgets, groceries, bills, savings, and shared spending in their own currency.

This is stronger than the previous LKR-only positioning because it keeps the household focus while allowing broader markets.

Recommended first market message:

> Manage your home money together: budgets, groceries, bills, savings, and shared expenses in one family space.

## MVP Quality

What is strong now:

- Shared household profiles are a good foundation.
- Expenses, shopping, bills, and savings now fit one real household workflow.
- Multi-currency makes the app more flexible for different markets.
- Invite flow is backend-tested.
- Backend pytest passed: 5/5 tests, 0 failures, 0 skipped.
- Frontend TypeScript passed after latest main pull.
- npm audit passed with 0 vulnerabilities.
- Security hardening is improved through restricted backend CORS.
- Debug logging risk has been reduced.

What still needs proof:

- Full P0 regression after the multi-currency merge.
- Currency consistency across dashboard, budget, expense, shopping, bills, savings, and notifications.
- Two-user realtime behavior after the modular UI and currency changes.
- Real Android/iOS push notification delivery on physical devices.
- Real household usability: can non-technical family members understand and use it without help?

## P0 Business Regression Focus

The P0 regression checklist now needs currency checks because currency is part of the core financial experience.

Must-pass P0 areas:

- Signup and signin
- Create profile with selected currency
- Currency persistence after signout/signin
- Budget create/edit/delete/reset with correct currency display
- Expense add/edit/delete with correct totals
- Shopping item bought with linked expense and correct currency
- Borrow/repay member balance with correct currency
- Bill payment with correct currency and budget link behavior
- Savings deposit/withdraw/delete with correct currency totals
- Invite second user and accept invite
- Member view
- Notifications receive/read
- Realtime updates across two sessions

If any currency flow displays the wrong symbol, wrong rounding, or inconsistent totals, public release should be blocked.

## Production Business Readiness

Current score:

- Idea: 8/10
- MVP feature set: 8.5/10
- Technical gate confidence: 7/10
- Market clarity: 6/10
- Monetization readiness: 3/10
- Customer trust readiness: 6/10
- Overall production business readiness: 6.5/10

The score improved because multi-currency broadens market fit and backend tests are passing. It is still below production-ready because app-level regression and real-device push validation remain incomplete.

## Main Launch Risks

### 1. Trust Risk

Users are entering household money data. Trust is the product.

Needed before launch:

- Clear privacy policy
- Support contact
- Data deletion explanation
- Secure invite behavior
- No sensitive production logs
- Consistent currency formatting across all money screens
- Clear explanation that the app records values in the chosen currency and does not automatically convert exchange rates unless that feature is added later

### 2. Reliability Risk

Backend pytest passing is a strong signal, but production reliability depends on end-to-end user flows.

Needed before launch:

- Full P0 regression report
- Currency regression evidence
- Two-user realtime validation
- Android and iOS push validation
- Evidence that bills and savings still work after the multi-currency merge

### 3. Positioning Risk

Multi-currency can make the app more global, but the product should not become too broad.

Keep the wedge focused:

- Shared household budget
- Grocery spending
- Bills and savings in one home space
- Easy invite for spouse, family, or roommate
- User-selected currency

Avoid claiming:

- Bank sync
- Tax support
- Investment tracking
- Automatic exchange-rate conversion
- Enterprise accounting

### 4. Retention Risk

A finance app only becomes a business if people use it every week.

Retention loops to validate:

- Weekly home spending summary
- Monthly budget reset/close
- Shopping-to-expense conversion
- Bill payment reminders
- Savings progress tracking
- Family notifications

## Recommended Pre-Release Business Plan

1. Run the full P0 checklist after the multi-currency merge.
2. Include currency checks in every money flow.
3. Validate push notifications on one Android and one iOS physical device.
4. Test with 5 to 10 real households before public launch.
5. Rewrite app store messaging around shared household finance, not generic expense tracking.
6. Prepare privacy, support, FAQ, screenshots, and onboarding copy.
7. Track MVP metrics:
   - household created
   - currency selected
   - second member invited
   - first budget created
   - first shopping item bought
   - first bill paid
   - first savings entry added
   - week-two return

## Popular App Lessons

Splitwise wins because it has one clear job: who owes who.

YNAB wins because it sells a method: control money before spending.

OurGroceries wins because it is simple and daily.

NestLedger should combine those lessons carefully, but not try to look like all three.

The focused wedge should be:

> The shared household budget and grocery money app, in your currency.

## Release Recommendation

Do not release publicly yet.

The app is acceptable for a controlled beta only after the updated P0 regression passes. For public production, finish:

- Full P0 regression evidence, including currency
- Real-device push validation
- App store readiness materials
- Real household pilot feedback

## Final Business Conclusion

NestLedger is becoming a serious household finance product. Multi-currency support makes the opportunity bigger and the product less limited to one local market.

But production business readiness is not only about having more features. For a finance-related family app, production means users can trust every amount, every currency symbol, every invite, every notification, and every realtime update.

Current decision: **controlled beta ready only after P0 regression passes; not public production-ready until push validation and real household pilot feedback are complete**.
