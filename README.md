##Humanitarian Challenge


mobile multi-player web based game based on Cards Against Humanity (<code>www.cardsagainsthumanity.com</code>).

Game hosted at: <code>http://humanitarianchallenge.co/</code>


###Built using:
  - __digital ocean__ <code>https://www.digitalocean.com/</code> for hosting
  - __nodejs__ - <code>http://nodejs.org/</code> for back end functionality
  - __socketio__ - <code>http://socket.io/</code> for websocket and realtime browser to server interactions
  - __jquery mobile__ - <code>http://jquerymobile.com/</code> for front-end UI
  - __jquery core__ - <code>http://jquery.com/</code> for front-end UX

---

###Developer Notes

####Client events:
    - black_card_update # instruct client to update black card
    - czar_update # instruct client to update who is czar
    - white_card_update # instruct client to modify white cards
    - update_score # instruct client to refresh score/user table
    - reconnect_failed # a reconnection to the back end failed. Display error message to user
    - reconnecting # lost connection to back-end. Attempting a reconnect. Display error message to user
    - reconnect # successfully re-connected
    - unlock_submit # unlock submit button at start of new round
    - update_submits # instruct client to update submit card for card czar
    - redraw_remaining_update # instruct client to update the number of redraws remaining
    - update_score # instruct client to upadte score section
    - test_event # test event that will log to the data to the console

####TODO:
  - update redraw event to also draw new card so user doesnt have to click 'redraw' and then 'draw'
  - restructure/break code out maintainable files

