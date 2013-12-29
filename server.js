// client events:
//  black_card_update - update black card
//    + cardtext, cardid, pick2
//  czar_update - modify user who is czar 
//    + czar_uid
//  white_card_update - modify white cards
//    + [index : {card_text:, card_id:}]
// includes
var express = require('express');

var app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server)
// listen on port
server.listen(8000);

// what to use
app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser());
app.use(express.static(__dirname, 'public'));

// helper functions
function connect_to_db() {
  var mysql = require('mysql');
  var properties = require('./properties');
  var connection = mysql.createConnection(properties.db_properties); 
  return connection;
}

// fire events to get users game board setup
function bootstrap_user(socket,data) {
  socket.join(data.game_uid);
  var connection = connect_to_db();
  connection.query("select uid from player_list where czar = 1 and game_id = ?",[data.game_uid],function(err,rows){
    if(err) throw err;
    socket.emit('czar_update', {czar_uid: rows[0].uid}); 
    connection.end();
  });
  var connection2 = connect_to_db();
  connection2.query("select black_card_deck.text,black_card_deck.Pick2,black_card_deck.id from black_card_deck, black_card_discard where black_card_discard.black_card_id = black_card_deck.id and game_id = ? and active = 1",[data.game_uid],function(err,rows){
    if(err) throw err;
    console.log(rows[0]);
    var build_json = {}
    // there may be no active black cards, in this case return a the equivalent of a blank card"
    if(!rows[0])
    {
      build_json = {cardtext: "", cardid: "-1", pick2: "0"} 
    }
    else
    {
      build_json = {cardtext: rows[0].text, cardid: rows[0].id, pick2: rows[0].Pick2}
    }
    socket.emit('black_card_update',build_json);
    connection2.end();
  });

  build_white_card_hand(data.player_uid,data.game_uid,10,function(data){
    socket.emit('white_card_update',data);
  });
}

function build_white_card_hand(player_uid,game_uid,user_full_cards,callback)
{
  var connection = connect_to_db();
  connection.query("select user_hand.white_card_id, white_card_deck.text from user_hand, white_card_deck where user_hand.white_card_id = white_card_deck.id and user_hand.user_uid = ? and active = 1 order by time",[player_uid],function(err,rows){
    var json_build = {};
    var count = 0;
    for(var i=0;i<rows.length;i++){
      count++;
      var name_number = i + 1;
      var element_name = name_number + "_white_card_contents";
      var element_details = { card_text: rows[i].text, card_id: rows[i].white_card_id};
      json_build[element_name] = element_details; 
    }
    // if a user doesnt have a full hand, populate rest as "blank" cards
    while(count < user_full_cards)
    {
      var name_number = count + 1;
      var element_name = name_number + "_white_card_contents";
      var element_details = { card_text: "", card_id: "-1"};
      json_build[element_name] = element_details; 
      count++;
    }
    callback(json_build);
  });
  connection.end();
}


// socket events
io.sockets.on('connection', function (socket) {
 //socket.join('room1');
 console.log("someone connected")
 //io.sockets.in('room1').emit('news', {hello: 'world'});
 //io.sockets.in('room2').emit('news', {hello: 'world2'});
 socket.on('bootstrap', function(data) {
   bootstrap_user(socket,JSON.parse(data)) 
 });

 socket.on('white_card_draw', function(data,ret) {
  var data = JSON.parse(data);
  var connection = connect_to_db();
  var user_full_cards = 10;
  var unix_time_stamp = Math.round(+new Date()/1000);
  connection.query("select count(*) AS total from user_hand where user_uid = ? and active = 1",[data.player_uid],function(err,rows){
    if(err) throw err;
    var cards_needed = user_full_cards - rows[0].total;
    // need to draw some
    if(cards_needed > 0)
    {
      var connection2 = connect_to_db();
      connection2.query("SELECT * from white_card_deck where id NOT IN (select white_card_id from user_hand where game_id = ?) ORDER BY RAND( ) LIMIT 0,"+cards_needed,[data.game_uid],function(err,rows){
        if(err) throw err;
        var new_cards_available = rows.length
        // don't have enough cards, reshuffle white
        if(new_cards_available < cards_needed)
        {
          var connection3 = connect_to_db();
          connection3.query("delete from user_hand where active = 0 and game_id = ?",[data.game_uid],function(err,rows){
            if(err) throw err;
          });
          connection3.end();
          var connection4 = connect_to_db();
          connection4.query("SELECT * from white_card_deck where id NOT IN (select white_card_id from user_hand where game_id = ?) ORDER BY RAND( ) LIMIT 0,"+cards_needed,[data.game_uid],function(err,rows){
            if(err) throw err;

            var connection5 = connect_to_db();
            var query_fields = ""
            for(i=0;i < rows.length;i++){
                if( i != 0) { query_fields = query_fields + ",";}
                query_fields = query_fields+"("+ connection5.escape(data.player_uid)+","+connection5.escape(rows[i].id)+","+connection5.escape(data.game_uid)+",1,"+connection5.escape(unix_time_stamp)+")";
            }
            // build_white_card_hand and return to calling socket
            connection5.query("INSERT INTO user_hand VALUES" + query_fields,function(err){
              if(err) throw err;
              build_white_card_hand(data.player_uid,data.game_uid,user_full_cards,function(data){
                ret(data);
              });
            });
            connection5.end();
          });
          connetion4.end();
        }
        else
        {
          var connection6 = connect_to_db();
          var query_fields = ""
          for(i=0;i < rows.length;i++){
              if( i != 0) { query_fields = query_fields + ",";}
              query_fields = query_fields+"("+ connection6.escape(data.player_uid)+","+connection6.escape(rows[i].id)+","+connection6.escape(data.game_uid)+",1,"+connection6.escape(unix_time_stamp)+")";
          }
          // build_white_card_hand and return to calling socket
          connection6.query("INSERT INTO user_hand VALUES" + query_fields,function(err){
            if(err) throw err;
            build_white_card_hand(data.player_uid,data.game_uid,user_full_cards,function(data){
              ret(data);
            });
          });
          connection6.end();
        }
      }); 
      connection2.end();
    }
    else
    {
      // build_white_card_hand and return to calling socket
      build_white_card_hand(data.player_uid,data.game_uid,user_full_cards,function(data){
        ret(data);
      });
    }
  });
  connection.end();
 });

 socket.on('black_card_draw', function(data) {
  var data = JSON.parse(data);
  var game_uid = data.game_uid 
  var player_uid = data.player_uid
  var connection = connect_to_db();
  connection.query("update black_card_discard set active = 0 where active = 1 and game_id = ?", [game_uid],function(err,rows){
    if (err) throw err;
    connection.query("select id,Text,Pick2 from black_card_deck where id not in (select black_card_id from black_card_discard where game_id = ? ) ORDER BY RAND() LIMIT 0,1",[game_uid], function(err,rows){
      if (err) throw err;
      // went through all of the black cards - reshuffle
      if(rows.length == 0)
      {
        var connection2 = connect_to_db();
        connection2.query("delete from black_card_discard where game_id = ?", [game_uid], function(err,rows){
          if (err) throw err;
          connection2.query("select id,Text,Pick2 from black_card_deck where id not in (select black_card_id from black_card_discard where game_id = ? ) ORDER BY RAND() LIMIT 0,1",[game_uid], function(err,rows){
          if (err) throw err;
          var insert_fields = {black_card_id: rows[0].id, game_id: game_uid, user_uid: player_uid, active: 1};
          connection2.query("insert into black_card_discard SET ?", insert_fields, function(err,rows){
            connection2.end();
            io.sockets.in(game_uid).emit('black_card_update',{cardtext: rows[0].Text, cardid: rows[0].id, pick2: rows[0].Pick2});
          });
        });
        });
      }
      else
      {
        var insert_fields = {black_card_id: rows[0].id, game_id: game_uid, user_uid: player_uid, active: 1};
        connection.query("insert into black_card_discard SET ?", insert_fields, function(err,rows2){
            io.sockets.in(game_uid).emit('black_card_update',{cardtext: rows[0].Text, cardid: rows[0].id, pick2: rows[0].Pick2});
            connection.end();
        }); 
      }
    });
  });
 });
 // creates a new game code
 socket.on('new_game_create', function (data,ret) {
  var redraw_input = data.redraw_input;
  var connection = connect_to_db();
  var json_build = {} 
  connection.query("select max(game_code) AS last_game_code from game_details",function(err,rows){
    if (err) throw err;
    var next_code = rows[0].last_game_code + 1; 
    var unix_time_stamp = Math.round(+new Date()/1000);
    var insert_fields = { game_code: next_code, "date": unix_time_stamp, num_redraw_allowed: redraw_input  }
    socket.join(next_code);
    connection.query("insert into game_details SET ?",insert_fields,function(err,rows){
      if (err) throw err;
      json_build['game_code'] = next_code;
      ret(json_build);
      connection.end(); 
    }); 
  }); 
 });
 
  // registers user to an existing game
  socket.on('new_user_register', function (data,ret) {
  console.log( "received new_user_register_event with data" + data);
  var code_box = data.code_box
  var player_name = data.player_name
  var connection = connect_to_db();
  var json_build = {}
  connection.query("select count(*) AS total from game_details where game_code = ?",[code_box],function(err,rows){
    if (err) throw err; 
    // not a valid game code
    if(rows[0].total == 0)
    {
      json_build['returnstatus'] = 'error';
      json_build['returnmessage'] = 'Not a valid game code. please enter again';
      ret(json_build);
    }
    else
    {
      connection.query("select count(*) AS player_total from player_list where game_id = ?",[code_box], function(err,rows){
        if (err) throw err;
        // first player, they will be czar
        var insert_fields = {};
        if(rows[0].player_total == 0)
	      {
          insert_fields = {name: player_name, game_id: code_box , points: 0, czar: 1 }; 
	      } 
        else
        {
          insert_fields = {name: player_name, game_id: code_box , points: 0, czar: 0 }; 
        }
          
        connection.query("insert into player_list SET ?", insert_fields, function(err){
          if (err) throw err;
          connection.query("select uid from player_list where name = ? and game_id = ?",[player_name, code_box], function(err,rows){
            if (err) throw err;
            json_build['returnstatus'] = 'success';
            json_build['player_uid'] = rows[0].uid;
            json_build['game_uid'] = code_box;
            ret(json_build);
            connection.end(); 
          });
        });
      });
    }
  });
  });
});


// route handlers
app.get('/test.txt', function(req, res){
  var body = 'it worked!';
  res.send(body);
});	

app.get('/socket-test', function(req, res){
  res.sendfile(__dirname + '/public/socket-test.html');
});	

app.get('/', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});	

app.get('/index.html', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});	

app.get('/db-query', function (req, res) {

  var connection = connect_to_db()
  connection.connect();
  
  connection.query('SELECT * from user_hand', function(err, rows, fields) {
    if (err) throw err;
 
    for ( var i=0;i < rows.length;i++)
    {
      console.log(rows[i].user_uid)
    } 
    console.log('The solution is: ', rows[0].user_uid);
  });
  
  connection.end();
});

console.log('Listening on port 8000');

