Feature: Creating, joining and rejoining games

  @W-11 @W-12
  Scenario: Create a game and invite a friend
    Given Anna opens the app and enters the nickname "Anna"
    When she creates a game with default options
    Then she receives an invite link and is seated at seat 0
    When Ben opens the invite link and enters the nickname "Ben"
    Then Ben is seated at seat 1 and the game starts

  @W-14
  Scenario: A full game rejects further visitors
    Given a game whose two seats are taken
    When a third person opens the invite link
    Then they see "This game is full"

  @W-20
  Scenario: Engine options are passed to the game
    When Anna creates a game with deck size "half", empty library "reshuffle" and max turns 30
    Then the engine config of the game has those values

  @P-06 @W-05
  Scenario: Rejoin after a connection loss
    Given a game in progress and Ben has the app open
    When Ben's connection drops for 2 minutes
    Then Anna sees that Ben is disconnected and the game is unchanged
    When Ben's connection returns
    Then his client reconnects with its last known version and receives a snapshot with the missed events

  @W-05 @A-03
  Scenario: Games survive a server restart
    Given a game in progress at version 12
    When the server restarts
    And both players reconnect
    Then both receive a snapshot at version 12 with identical state to before the restart

  @W-13
  Scenario: Rejoin on another device with the rejoin link
    Given Anna copied her rejoin link
    When she opens it on a second device
    Then she is seated as Anna and sees the current game

  @P-03
  Scenario: A stale action is applied at most once
    Given the game is at version 7 and it is Anna's turn
    When Anna's client sends "EndTurn" for version 7 twice
    Then the first is applied and the second is rejected as stale_version

  @P-01 @A-02
  Scenario: Hidden information never reaches the opponent
    Given Anna holds a Forest and a Mountain in hand
    Then every message sent to Ben contains neither card
    And no message to either player contains the seed or library order

  @P-08 @W-35
  Scenario: Windows with no possible counter are auto-passed after a random delay
    Given Ben holds no Island
    When Anna plays a land
    Then Ben is not prompted
    And the land resolves between 1 and 3 seconds later

  @W-40 @W-41
  Scenario: Rematch
    Given a finished game that Anna lost
    When both players tap Rematch
    Then a new game with the same options starts in the same room with Anna as first player

  @W-39
  Scenario: Cancel game
    Given a game in progress
    When Anna confirms "Cancel game"
    Then the game ends for both players with no result
