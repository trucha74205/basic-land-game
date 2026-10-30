Feature: Notifications

  @N-01 @N-03
  Scenario: Push when the app is closed
    Given Ben enabled notifications and closed the app
    When Anna ends her turn
    Then after about 5 seconds Ben receives a push "Your turn against Anna"

  @N-03
  Scenario: No push while the app is visible
    Given Ben has the game open and visible
    When Anna ends her turn
    Then Ben receives no push but hears the in-app cue

  @N-04
  Scenario: No duplicate push during a reconnect
    Given Ben's page is reconnecting when Anna ends her turn
    When Ben's socket reconnects and reports visible within 5 seconds
    Then no push is sent

  @N-01
  Scenario: Counter window notifies only when a counter is possible
    Given Ben holds an Island and a Swamp
    When Anna plays a land
    Then Ben is notified "Anna played Mountain: respond?"
    Given Ben holds no Island
    Then Ben is not notified

  @N-05
  Scenario: Push content is public information only
    When any push is sent
    Then its payload contains no hand contents

  @N-07
  Scenario: Expired subscriptions are removed
    Given a stored subscription whose endpoint returns 410
    When a push is attempted
    Then the subscription is deleted

  @N-10
  Scenario: Enabling notifications on iOS outside the installed PWA
    Given Safari on iOS in a normal tab
    When the player taps "Enable notifications"
    Then the app explains that it must be added to the Home Screen first
