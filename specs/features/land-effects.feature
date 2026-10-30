Feature: Land entry effects

  @R-41
  Scenario: Island draws a card
    Given player 0 holds an Island and has a library of 10 cards
    When player 0 plays the Island and it resolves
    Then the Island is on player 0's battlefield
    And player 0 drew one card

  @R-42
  Scenario: Swamp makes the opponent discard a land chosen by the caster
    Given player 0 holds a Swamp and player 1 holds a Forest and a Mountain
    When player 0 plays the Swamp and it resolves
    Then player 0 sees player 1's hand
    When player 0 chooses the Mountain
    Then the Mountain is in player 1's graveyard

  @R-42 @R-23
  Scenario: Swamp against an empty hand fizzles
    Given player 0 holds a Swamp and player 1 has an empty hand
    When player 0 plays the Swamp and it resolves
    Then the Swamp is on player 0's battlefield
    And the effect fizzled

  @R-43
  Scenario: Mountain destroys a declared opposing land
    Given player 1 has a Forest on the battlefield and player 0 holds a Mountain
    When player 0 plays the Mountain targeting the Forest and it resolves
    Then the Forest is in player 1's graveyard
    And the Mountain is on player 0's battlefield

  @R-43 @R-23
  Scenario: Mountain with no opposing lands fizzles
    Given player 1 has no lands on the battlefield and player 0 holds a Mountain
    When player 0 plays the Mountain and it resolves
    Then the Mountain is on player 0's battlefield
    And the effect fizzled

  @R-44
  Scenario: Forest returns a land from the graveyard
    Given player 0 has a Swamp in their graveyard and holds a Forest
    When player 0 plays the Forest targeting the Swamp and it resolves
    Then the Swamp is in player 0's hand

  @R-44 @R-23
  Scenario: Forest with an empty graveyard fizzles
    Given player 0 has an empty graveyard and holds a Forest
    When player 0 plays the Forest and it resolves
    Then the Forest is on player 0's battlefield
    And the effect fizzled

  @R-40
  Scenario: Plains repeats the Island draw
    Given player 0 has an Island on the battlefield and holds a Plains
    When player 0 plays the Plains targeting the Island and it resolves
    Then player 0 drew one card

  @R-40 @R-40b
  Scenario: Plains copying Mountain chooses the destroyed land at resolution
    Given player 0 has a Mountain on the battlefield and holds a Plains
    And player 1 has a Forest and a Swamp on the battlefield
    When player 0 plays the Plains targeting their Mountain
    Then the declared target is player 0's Mountain
    And the land to destroy is not yet chosen
    When the Plains resolves and player 0 chooses the Swamp
    Then the Swamp is in player 1's graveyard

  @R-40a
  Scenario: Plains cannot target another Plains
    Given player 0 has a Plains on the battlefield and holds a Plains
    When player 0 tries to play the Plains targeting the Plains on the battlefield
    Then the action is rejected

  @R-40c @R-23
  Scenario: Plains with no other non-Plains land fizzles
    Given player 0 has no other lands on the battlefield and holds a Plains
    When player 0 plays the Plains and it resolves
    Then the Plains is on player 0's battlefield
    And the effect fizzled

  @R-42a
  Scenario: Swamp reveal is private to the Swamp player
    Given player 0 plays a Swamp against player 1's hand of Forest and Mountain
    When the Swamp resolves
    Then player 0's event stream contains the revealed cards
    And player 1's event stream shows a reveal without cards
