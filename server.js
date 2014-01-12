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
var properties = require('./properties');
var auth = express.basicAuth(properties.admin_credentials.user_name,properties.admin_credentials.password);

// helper functions
function connect_to_db() {
  var mysql = require('mysql');
  var properties = require('./properties');
  var connection = mysql.createConnection(properties.db_properties); 
  return connection;
}

function czar_refresh_selective(socket,game_uid,scope){
  var connection = connect_to_db();
  var json_build = {};
  connection.query("select uid from player_list where czar = 1 and game_id = ?",[game_uid],function(err,rows){
    if(err) throw err;
    if(rows.length != 0)
    {
      json_build = {czar_uid: rows[0].uid};
      if ( scope == 'broadcast')
      {
        io.sockets.in(game_uid).emit('czar_update', json_build); 
      }
      else
      {
        socket.emit('czar_update',json_build);
      }
    }
  });
  connection.end();
}

function black_card_refresh_selective(socket,game_uid,scope)
{
  var connection = connect_to_db();
  connection.query("select black_card_deck.text,black_card_deck.Pick2,black_card_deck.id from black_card_deck, black_card_discard where black_card_discard.black_card_id = black_card_deck.id and game_id = ? and active = 1",[game_uid],function(err,rows){
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

    if(scope == 'broadcast')
    {
      io.sockets.in(game_uid).emit('black_card_update', build_json); 
    }
    else
    {
      socket.emit('black_card_update', build_json);
    }
  });  
  connection.end();
}
// fire events to get users game board setup
function bootstrap_user(socket,data) {
  socket.join(data.game_uid);

  czar_refresh_selective(socket,data.game_uid,'socket');

  black_card_refresh_selective(socket,data.game_uid,'socket')

  build_white_card_hand(data.player_uid,data.game_uid,10,function(data){
    socket.emit('white_card_update',data);
  });

  // since we want all users to see the new user has joined, broadcast out
  update_score_selective(socket,data.game_uid,'broadcast');

  update_redraw_remaining(socket,data.player_uid,data.game_uid)

  update_submits_selective(socket,data.game_uid,'broadcast')
}

function remove_user(socket,data){
  var connection = connect_to_db();
  connection.query("select czar from player_list where uid = ?",[data.player_uid], function(err, rows){
    // user is czar, need to make someone else czar
    if(rows.length == 1) 
    {
      var connection2 = connect_to_db();
      connection2.query("select uid from player_list where game_id = ? and uid != ? order by uid limit 0,1",[data.game_uid,data.player_uid], function(err, rows){
        if( rows.length != 0 )
        {
          var connection3 = connect_to_db();
          connection3.query("update player_list set czar = 1 where uid = ?",[rows[0].uid], function(err, rows){
          });
          connection3.end();
        }

        var connection4 = connect_to_db();
        connection4.query("update black_card_discard set active = 0 where game_id = ? and user_uid = ?",[data.game_uid,data.player_uid], function(err, rows){
          black_card_refresh_selective(socket,data.game_uid,'broadcast');
        });
        connection4.end();
      });
      connection2.end();
    }
    var connection5 = connect_to_db();
    connection5.query("update user_hand set active = 0 where user_uid = ? and game_id = ?",[data.player_uid,data.game_uid],function(err,rows){  
      var connection6 = connect_to_db();
      connection6.query("delete from player_list where uid = ?",[data.player_uid],function(err,rows){
        var connection7 = connect_to_db();
        connection7.query("delete from card_submit_pile where game_uid = ?",[data.game_uid],function(err,rows){
          update_score_selective(socket,data.game_uid,'broadcast');
          czar_refresh_selective(socket,data.game_uid,'broadcast');
        });
        connection7.end();
      });
      connection6.end();
    });
    connection5.end(); 
  });
  connection.end();
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

function update_submits_selective(socket,game_uid,scope)
{

  var connection = connect_to_db();
  var json_build = {};
  connection.query("select count(*) AS total_players from player_list where game_id = ?",[game_uid],function(err,rows){
    var connection2 = connect_to_db();
    connection2.query("select count(*) AS total_submitted from card_submit_pile where game_uid = ?",[game_uid],function(err,rows2){
      if( rows[0].total_players != 1 && rows[0].total_players == (rows2[0].total_submitted + 1))
      {
        json_build['allsubmitted'] = "true";
        json_build['submissions'] = new Array();
        var connection3 = connect_to_db();
        connection3.query("select user_uid, cards_id_combined from card_submit_pile where game_uid =?",[game_uid],function(err,rows3){
          var num_running_queries = 0;
          for(var i = 0; i < rows3.length; i++)
          {
            num_running_queries++; 
            var cards_split = rows3[i].cards_id_combined.split(';');
            var or_string = "";
            for(var x = 0; x < cards_split.length;x++)
            {
              if(x != 0) { or_string += " OR "};
              or_string += "id = "+cards_split[x]; 
            }
            var connection4 = connect_to_db();
            var submission_element = {};
            (function(user){
              connection4.query("select text from white_card_deck where " + or_string,function(err,rows4){
                var card_text_holder = "";
                for(var z = 0; z < rows4.length;z++)
                {
                 card_text_holder += rows4[z].text + ";"; 
                }
                submission_element = {};
                submission_element[user] = card_text_holder;
                json_build['submissions'].push(submission_element);
                num_running_queries--;
                if(num_running_queries === 0)
                {
                  if(scope == 'broadcast')
                  {
                    io.sockets.in(game_uid).emit('update_submits', json_build);
                  }
                  else
                  {
                    socket.emit('update_submits',json_build);
                  } 
                }
              });
              connection4.end();  
          }(rows3[i].user_uid));
          }  
        });
        connection3.end();
      }
      else
      {
        json_build['allsubmitted'] = "false";
        json_build['numneedingtosubmit'] = rows[0].total_players - 1 - rows2[0].total_submitted 
        if(scope == 'broadcast')
        {
          io.sockets.in(game_uid).emit('update_submits', json_build);
        }
        else
        {
          socket.emit('update_submits',json_build);
        } 
      }
    }); 
    connection2.end();
  });
  connection.end();
}

function update_score_selective(socket,game_uid,scope)
{
  var connection = connect_to_db();
  var json_build = {};
  connection.query("SELECT name, points, czar, wonlast from player_list where game_id = ?",[game_uid],function(err,rows){
    for(var i=0; i < rows.length; i++){
      var element_details = {score: rows[i].points, wonlast: rows[i].wonlast, czar: rows[i].czar};
      json_build[rows[i].name] = element_details;
    }
    if(scope == 'broadcast')
    {
      io.sockets.in(game_uid).emit('update_score', json_build);
    }
    else
    {
      socket.emit('update_score',json_build);
    }
       
  }); 
  connection.end();
}

function update_redraw_remaining(socket,player_uid,game_uid)
{
  var connection = connect_to_db();
  connection.query("SELECT number_redraws from player_list where uid = ?",[player_uid],function(err,rows){
    var connection2 = connect_to_db();
    var json_build = {};
    connection2.query("SELECT num_redraw_allowed from game_details where game_code = ?",[game_uid],function(err,rows2){
      json_build['redraws_remaining'] = rows2[0].num_redraw_allowed - rows[0].number_redraws; 
      socket.emit('redraw_remaining_update',json_build);
    });
    connection2.end();  
  });
  connection.end();
}

function submit_white_cards(socket,player_uid,game_uid,cards,callback)
{
  var connection = connect_to_db();
  var insert_fields = {user_uid: player_uid,game_uid: game_uid, cards_id_combined: cards};
  connection.query("insert into card_submit_pile SET ?", insert_fields,function(err,rows){
    // todo: callback on error
    if(!err)
    {
      var cards_split = cards.split(';');
      var or_string = "";
      for(var i=0;i < cards_split.length;i++)
      {
         if(i != 0) { or_string += " OR ";}
         or_string += "white_card_id = "+cards_split[i]; 
      }
      var connection2 = connect_to_db();
      connection2.query("update user_hand set active = 0 where user_uid = ? and game_id = ? and (" + or_string + ")", [player_uid,game_uid], function(err,rows){
       callback();
      });
      connection2.end();
    }
  }); 
  connection.end();

}

function redraw_white(socket,player_uid,game_uid,cards,callback)
{
  var card_split = cards.split(';');
  var connection = connect_to_db();
  var or_string = "";
  var i;
  for(i = 0; i < card_split.length;i++)
  {
    if( i != 0){ or_string += " OR ";}
    or_string += "white_card_id = " + card_split[i];
  }
  connection.query("update user_hand set active = 0 where user_uid = ? and game_id = ? and ( " + or_string + ")",[player_uid,game_uid], function(err,rows){
    var connection2 = connect_to_db();
    connection2.query("SELECT number_redraws from player_list where uid = ?",[player_uid], function(err,rows){
      var connection3 = connect_to_db();
      connection3.query("update player_list set number_redraws = ? where uid = ?",[rows[0].number_redraws + i,player_uid],function(err,rows){
        callback();
      });
      connection3.end(); 
    });
    connection2.end();
  });
  connection.end();
}

function submit_winner(socket,winner_player_uid,game_uid,callback)
{
  var connection = connect_to_db();
  var json_build = {};
  connection.query("select points from player_list where uid = ?",[winner_player_uid],function(err,rows){
    var connection2 = connect_to_db();
    connection2.query("update player_list set wonlast = 0 where game_id = ?",[game_uid],function(err,rows2){
      var connection3 = connect_to_db();
      connection3.query("update player_list set points = ? , wonlast = 1 where uid = ?",[rows[0].points + 1,winner_player_uid],function(err,rows3){
        json_build['return_status'] = "success";
        callback(json_build); 
      });
      connection3.end();
    });
    connection2.end();
  });
  connection.end();
}

function create_new_round(socket,game_uid,callback)
{
  
  var connection = connect_to_db();
  connection.query("select uid,czar from player_list where game_id = ? order by uid",[game_uid],function(err,rows){
    var new_czar_id;
    for(var i = 0; i < rows.length; i++)
    {
      if(rows[i].czar == 1)
      {
        if( i == rows.length -1)
        {
          new_czar_id = rows[0].uid;
        }
        else
        {
          new_czar_id = rows[i + 1].uid
        }
      }
    } 
    
    var connection2 = connect_to_db();
    connection2.query("delete from card_submit_pile where game_uid = ?",[game_uid],function(err,rows){
      var connection3 = connect_to_db();
      connection3.query("update black_card_discard set active = 0 where game_id = ?",[game_uid],function(err,rows){
        var connection4 = connect_to_db();
        connection4.query("update player_list set czar = 0 where czar = 1 and game_id = ?",[game_uid],function(err,rows){
          var connection5 = connect_to_db();
          connection5.query("update player_list set czar = 1 where uid = ?",[new_czar_id],function(err,rows){
            callback();
          });
          connection5.end();
        });
        connection4.end();
        });
        connection3.end();
      });
    connection2.end();
  });
  connection.end();  
}

function select_random_rows(rows,return_number)
{
  var new_rows_array = Array();
  
  for(var i = 0; i < return_number; i++)
  {
    random_num = Math.floor((Math.random()*rows.length));
    new_rows_array.push(rows[random_num]);
    rows.splice(random_num,1);
  }
  return new_rows_array;
}
// socket events
io.sockets.on('connection', function (socket) {
  console.log("someone connected");

  socket.on('bootstrap', function(data) {
    bootstrap_user(socket,JSON.parse(data)); 
  });

  socket.on('get_suggested_cards', function(data,ret){
    var connection = connect_to_db();
    connection.query("select * from stage_new_card", function(err,rows){
      ret(rows);
    });
    connection.end();
  });

  socket.on('deny_suggested_card', function(data,ret){
    var connection = connect_to_db();
    connection.query("delete from stage_new_card where uid = ?",[data.uid], function(err,rows){
      ret({});
    });
    connection.end();
  });

  socket.on('approve_suggested_card', function(data,ret){
    var connection = connect_to_db();
    var table = data.color + "_card_deck";
    if( data.color == 'white')
    {
      var insert_fields = {text: data.text };
    }
    else if (data.color == 'black')
    {
      console.log(data.pick2);
      if (data.pick2 == true)
      {
       var pick2_int = 1; 
      }
      else
      {
       var pick2_int = 0; 
      }
      var insert_fields = {Text: data.text, Pick2: pick2_int };
    }
    console.log(insert_fields)
    connection.query("insert into " + table + " SET ?",insert_fields, function(err,rows){
      if(err) throw err;
      var connection2 = connect_to_db();
      connection2.query("delete from stage_new_card where uid = ?", [data.uid], function(err,rows){
        ret({});
      }); 
      connection2.end();
    });
    connection.end();
  });

  socket.on('card_suggest_submit', function(data,ret) {
    var connection = connect_to_db();
    var insert_fields = {color: data.color, text: data.text};
    connection.query("insert into stage_new_card set ?",insert_fields, function(err,rows){
      ret({});
    });
    connection.end();
  });

  socket.on('redraw_white',function(data,ret){
    redraw_white(socket,data.player_uid,data.game_uid,data.cards,function(){
      update_redraw_remaining(socket,data.player_uid,data.game_uid) 
      ret({});
    });  
  });

  socket.on('submit_winner',function(data,ret){
    submit_winner(socket,data.winner_player_uid,data.game_uid, function(data2){
      update_score_selective(socket,data.game_uid,'broadcast');
      ret(data2);
    });
  });

  socket.on('create_new_round', function(data,ret){
    var data = JSON.parse(data);
    create_new_round(socket,data.game_uid,function(data2){
      czar_refresh_selective(socket,data.game_uid,'broadcast') 
      black_card_refresh_selective(socket,data.game_uid,'broadcast')
      update_submits_selective(socket,data.game_uid,'broadcast');
      update_score_selective(socket,data.game_uid,'broadcast');
      io.sockets.in(data.game_uid).emit('unlock_submit',{});
    });
  });

  socket.on('user_quit_game', function(data,ret){
    remove_user(socket,JSON.parse(data));
     //todo: check that remove_user was successful before returning
     ret({});
  });

  socket.on('submit_white_cards', function(data,ret){
   submit_white_cards(socket,data.player_uid,data.game_uid,data.cards,function(){
     update_submits_selective(socket,data.game_uid,'broadcast');
     ret({});
   });
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
      connection2.query("SELECT * from white_card_deck where id NOT IN (select white_card_id from user_hand where game_id = ?)",[data.game_uid],function(err,rows){
        if(err) throw err;
        var new_cards_available = rows.length
        // don't have enough cards, reshuffle white
        if(new_cards_available < cards_needed)
        {
          var connection3 = connect_to_db();
          connection3.query("delete from user_hand where active = 0 and game_id = ?",[data.game_uid],function(err,rows){
            if(err) throw err;
            var connection4 = connect_to_db();
            connection4.query("SELECT * from white_card_deck where id NOT IN (select white_card_id from user_hand where game_id = ?)",[data.game_uid],function(err,rows){
              if(err) throw err;

              var connection5 = connect_to_db();
              var query_fields = ""
              var rows =  select_random_rows(rows,cards_needed); 
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
            connection4.end();
          });
          connection3.end();
        }
        else
        {
          var connection6 = connect_to_db();
          var query_fields = ""
          var rows =  select_random_rows(rows,cards_needed); 
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

app.head('/suggested_card', function(req,res){
  var connection = connect_to_db();
  connection.query("select * from stage_new_card", function(err,rows){
    if(rows.length > 0)
    {
      res.send(200,''); 
    }
    else
    {
      res.send(204,''); 
    }
  });
  connection.end();
});

app.get('/', function(req, res){
  res.redirect('/index.html');
});	

app.get('/index.html', function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});	

app.get('/admin.html', auth, function(req, res){
  res.sendfile(__dirname + '/public/admin.html');
});	

app.get('/public/js/:file', auth, function(req, res){
  res.sendfile(__dirname + '/public/js/'+ req.params.file);
});	

app.get('/status', function(req, res){
  res.send('im alive');
});	

app.get('*', function(req, res){
  res.redirect('/index.html');
});	



console.log('Listening on port 8000');

