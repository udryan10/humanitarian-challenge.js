##Humanitarian Challenge


mobile multi-player web based game based on Cards Against Humanity (www.cardsagainsthumanity.com).

Game hosted at: http://humanitarianchallenge.co/


###Built using:
  - __digital ocean__ <code>https://www.digitalocean.com/</code> for hosting
  - __nodejs__ - <code>http://nodejs.org/</code> for back end functionality
  - __socketio__ - <code>http://socket.io/</code> for websocket and realtime browser to server interactions
  - __jquery mobile__ - <code>http://jquerymobile.com/</code> for front-end UI
  - __jquery core__ - <code>http://jquery.com/</code> for front-end UX

---

###Developer Notes

####Client events:
  - black_card_update - update black card
    - expects: cardtext, cardid, pick2
  - czar_update - update who is czar
    - expects: czar_uid
  - white_card_update - modify white cards
    - expects: [index : {card_text:, card_id:}]
  - update_score - refresh score/user table
    - expects: [name : {score:, wonlast:,czar:}]

####TODO:
  - in call back functions, need to send callback on an error and notify the client of the error so to display on screen
  - update redraw event to also draw new card so user doesnt have to click 'redraw' and then 'draw'
  -
