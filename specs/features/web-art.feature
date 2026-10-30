Feature: Land art and image caching

  @W-62 @W-63
  Scenario: Defaults need no network and no Scryfall
    Given neither player chose custom art
    When a game is played with the server and client offline from Scryfall
    Then every land tile shows its bundled default art
    And no request is made to Scryfall

  @W-63 @I-03
  Scenario: Scryfall is first contacted when the custom art picker opens
    Given a fresh server with no printing index
    When nobody opens the custom art picker
    Then the server makes no request to Scryfall
    When a player opens the Forest picker
    Then the server answers 202 building and then builds the index for Forest

  @W-60 @I-30
  Scenario: Reset to default
    Given Anna chose custom Mountain art
    When she resets Mountain to the default
    Then both players see the bundled default on her Mountains

  @I-32
  Scenario: Choosing the default printing in the picker equals the default
    When Anna picks the printing whose id is the Plains default
    Then the bundled file is used and no image request reaches the server

  @I-40 @I-41
  Scenario: Default art is bundled and precached
    When the web app is built
    Then the five default art_crop and normal files and default-art.json are in the output
    And the total size of the default art is below 2 MB
    And the service worker precaches them

  @W-60 @I-31
  Scenario: Each player sees the custom art the other chose
    Given Anna chose a Scryfall Mountain printing and Ben another
    When both play a Mountain
    Then Anna's Mountain shows her art on both screens and Ben's shows his

  @I-11
  Scenario: An image is downloaded once
    Given an image is not in the cache
    When three clients request it at the same time
    Then Scryfall is contacted once and all three get the image

  @I-11 @I-01
  Scenario: Scryfall requests are rate limited and identified
    When the server fetches the printing index or images
    Then consecutive Scryfall requests are at least 100 ms apart
    And each request carries a User-Agent and an Accept header

  @I-10 @S-05
  Scenario: The image proxy is not open
    When a client requests an id that is not in the printing index
    Then the server answers 404 and makes no outbound request

  @W-61 @I-13
  Scenario: Fallback when Scryfall is unreachable
    Given Anna chose custom art and the image is not cached and Scryfall is unreachable
    Then the tile shows the default art for that land type and the game remains playable

  @I-03
  Scenario: Printing index refresh failure keeps old data
    Given the index is 31 days old and Scryfall returns 503
    Then the existing index is still served and a retry is scheduled in 1 hour

  @W-60
  Scenario: Art gallery filters
    When the player filters the Forest gallery by artist
    Then only printings by that artist are listed
