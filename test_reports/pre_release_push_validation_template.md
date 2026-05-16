# NestLedger Push Validation Template

Use this template for the required physical-device push validation pass.

## Build Artifacts

- Android command: `eas build -p android --profile preview`
- iOS command: `eas build -p ios --profile preview`
- Android build ID:
- iOS build ID:

## Devices

| Platform | Device | OS version | App build | Tester account |
| --- | --- | --- | --- | --- |
| Android |  |  |  |  |
| iOS |  |  |  |  |

## Token Registration

| Platform | Permission prompt | Project ID found | Expo token registered | Notes |
| --- | --- | --- | --- | --- |
| Android |  |  |  |  |
| iOS |  |  |  |  |

## Fanout Scenarios

| Scenario | Sender | Receiver | Foreground | Background | App closed | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Add expense |  |  |  |  |  |  |
| Add shopping item |  |  |  |  |  |  |
| Mark shopping item bought |  |  |  |  |  |  |
| Accept invite |  |  |  |  |  |  |
| Mark bill paid |  |  |  |  |  |  |
| Savings deposit |  |  |  |  |  |  |
| Savings withdrawal |  |  |  |  |  |  |

## Failure Behavior

| Failure case | Expected | Actual | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Permission denied | User action still succeeds |  |  |  |
| Token missing | User action still succeeds |  |  |  |
| Expo push send failure | User action still succeeds |  |  |  |

## Production Decision

- Android push: `pass / fail / blocked`
- iOS push: `pass / fail / blocked`
- Release recommendation:
