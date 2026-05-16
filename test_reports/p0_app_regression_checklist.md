# NestLedger P0 App Regression Checklist

Use this checklist before public release. Fill every result as `Pass`, `Fail`, `Blocked`, or `Not Run`.

## Test Session Details

- Date:
- Tester:
- App build/profile:
- Backend URL:
- Database/Supabase project:
- Primary test user:
- Member test user:
- Device/session A:
- Device/session B:
- Notes:

## Release Rule

- Public production release is blocked if any P0 item is `Fail` or `Blocked`.
- P1 issues can be accepted only if documented with a business reason.
- Real push validation must be completed separately on physical Android and iOS devices.

## 1. Setup

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Install or open the latest app build. | App opens without crash. |  |  | P0 |
| 1.2 | Confirm backend URL points to the intended test/prod-like backend. | App connects to correct backend. |  |  | P0 |
| 1.3 | Prepare primary and member test users. | Both users are available for testing. |  |  | P0 |
| 1.4 | Start two sessions/devices if possible. | Session A and Session B can be used for realtime checks. |  |  | P0 |

## 2. Authentication

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Sign up with a new user. | User account is created and app enters onboarding/dashboard. |  |  | P0 |
| 2.2 | Sign out. | User returns to auth screen. |  |  | P0 |
| 2.3 | Sign in with the same user. | User reaches the app successfully. |  |  | P0 |
| 2.4 | Try wrong password. | App shows a clear error and does not crash. |  |  | P1 |

## 3. Household Profile

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Create a household profile. | Profile is created and selected. |  |  | P0 |
| 3.2 | Open profile switcher. | Current profile appears. |  |  | P0 |
| 3.3 | Create a second household profile. | Second profile is created. |  |  | P0 |
| 3.4 | Switch between profiles. | Data changes to the selected profile only. |  |  | P0 |
| 3.5 | Open members view. | Current user appears as a member. |  |  | P0 |

## 4. Budget

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Create a monthly budget. | Budget appears with correct amount and dates. |  |  | P0 |
| 4.2 | Edit budget amount/name. | Updated values appear correctly. |  |  | P0 |
| 4.3 | Add expense under the budget. | Budget spent/remaining values update. |  |  | P0 |
| 4.4 | Reset budget if reset is available. | Budget resets according to expected behavior. |  |  | P0 |
| 4.5 | Delete budget. | Budget is removed without app crash. |  |  | P0 |

## 5. Expenses

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Add a normal expense with category and amount. | Expense appears in the expense list. |  |  | P0 |
| 5.2 | Add expense with multiple items if supported. | Total is calculated correctly. |  |  | P0 |
| 5.3 | Edit expense. | Updated expense values persist. |  |  | P0 |
| 5.4 | Delete expense. | Expense is removed and budget totals update. |  |  | P0 |
| 5.5 | Filter expenses by category/view. | Correct expenses are shown. |  |  | P1 |

## 6. Shopping

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Add shopping item with quantity. | Item appears with correct quantity. |  |  | P0 |
| 6.2 | Mark item bought without budget link. | Item moves to bought state. |  |  | P0 |
| 6.3 | Mark item bought with price and budget link. | Linked expense is created and budget updates. |  |  | P0 |
| 6.4 | Mark bought item unbought. | Item returns to pending state and linked behavior is correct. |  |  | P0 |
| 6.5 | Delete shopping item. | Item is removed. |  |  | P0 |

## 7. Borrow And Repay

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 7.1 | Add borrow entry for a member. | Borrow appears in the app. |  |  | P0 |
| 7.2 | Edit borrow amount/details. | Updated borrow persists. |  |  | P0 |
| 7.3 | Add repayment. | Repayment appears and balance updates. |  |  | P0 |
| 7.4 | Verify member balance. | Balance equals borrow minus repayments. |  |  | P0 |

## 8. Bills

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Create recurring bill. | Bill appears in the bill tracker. |  |  | P0 |
| 8.2 | Create bill with category fields such as electricity/units if applicable. | Category-specific fields save correctly. |  |  | P0 |
| 8.3 | Mark bill paid without budget link. | Payment is recorded. |  |  | P0 |
| 8.4 | Mark bill paid with budget link. | Payment is recorded and linked budget updates. |  |  | P0 |
| 8.5 | Change bill month/year filter if available. | Correct monthly bill stats appear. |  |  | P1 |
| 8.6 | Delete bill. | Bill is removed without breaking payments screen. |  |  | P0 |

## 9. Savings

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 9.1 | Create or open savings tracker. | Savings tracker is visible. |  |  | P0 |
| 9.2 | Add deposit without budget link. | Savings total increases. |  |  | P0 |
| 9.3 | Add deposit with budget link if supported. | Savings total and linked budget behavior are correct. |  |  | P0 |
| 9.4 | Add withdrawal without budget link. | Savings total decreases. |  |  | P0 |
| 9.5 | Add withdrawal with budget link if supported. | Savings total and linked budget behavior are correct. |  |  | P0 |
| 9.6 | Delete savings entry. | Entry is removed and totals recalculate. |  |  | P0 |
| 9.7 | Change month/year filter if available. | Correct savings stats appear. |  |  | P1 |

## 10. Invite And Members

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 10.1 | Primary user sends invite to member user. | Invite link/token is created and no crash occurs. |  |  | P0 |
| 10.2 | Member user opens invite link/token. | Member can accept invite. |  |  | P0 |
| 10.3 | Member user joins household. | Member appears in the same profile. |  |  | P0 |
| 10.4 | Primary user opens members view. | Member user appears. |  |  | P0 |
| 10.5 | Try accepting invalid invite token. | App shows clear failure and does not crash. |  |  | P1 |

## 11. Notifications

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 11.1 | Trigger an app notification event, such as expense or invite/member join. | Notification appears in app. |  |  | P0 |
| 11.2 | Open notifications view. | Notification list loads. |  |  | P0 |
| 11.3 | Mark notification as read. | Unread count updates. |  |  | P0 |
| 11.4 | Confirm notification does not duplicate unexpectedly. | No duplicate spam for one action. |  |  | P1 |

## 12. Realtime Two-Session Checks

Use primary user in Session A and member user in Session B.

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 12.1 | Session A adds expense. | Session B sees expense without app restart. |  |  | P0 |
| 12.2 | Session B adds shopping item. | Session A sees shopping item without app restart. |  |  | P0 |
| 12.3 | Session A marks shopping item bought. | Session B sees bought state update. |  |  | P0 |
| 12.4 | Session B marks bill paid. | Session A sees bill payment update. |  |  | P0 |
| 12.5 | Session A adds savings deposit. | Session B sees savings update. |  |  | P0 |
| 12.6 | Session B reads notification. | Notification state remains consistent. |  |  | P1 |

## 13. Error Handling And Recovery

| Step | Action | Expected Result | Actual Result | Status | Severity |
| --- | --- | --- | --- | --- | --- |
| 13.1 | Temporarily lose network and reopen app. | App handles loading/error state without crash. |  |  | P1 |
| 13.2 | Submit an empty required form. | App prevents submit or shows clear validation. |  |  | P1 |
| 13.3 | Close and reopen app after creating data. | Data reloads correctly. |  |  | P0 |

## Final Result

- Total P0 Pass:
- Total P0 Fail:
- Total P0 Blocked:
- Total P1 Fail:
- Production decision:
- Required fixes before release:

