/**
 * Note, this file get's browserified via express middleware so we
 * can use require statements.
 */
var Game = require('bc19/game')
var SPECS = require('bc19/specs');

var UNIT_NAMES = [
    'Castle',
    'Church',
    'Pilgrim',
    'Crusader',
    'Prophet',
    'Preacher'
];

// external graphics
GRID_SIZE = 13;
GRID_SPACING = 2;

// internal graphics
MAX_SPRITES_PER_TYPE = 1000;

// replay computation
MAX_CHECKPOINTS = 1000; // store a checkpoint for each round

/*
Castle by BGBOXXX Design from the Noun Project
Church by Ben Davis from the Noun Project
Pilgrim Hat by Bonnie Beach from the Noun Project
Sword by uzeir syarief from the Noun Project
sniper by rizqa anindita from the Noun Project
Tank by Sandhi Priyasmoro from the Noun Project
*/

class Veww {
    process_replay(replay) {
        console.log('process');

        // check for bc19 update
        fetch('/version').then(function(resp) {
            resp.text().then(function(t) {
                console.log(t);

                var versions = JSON.parse(t);

                console.log(versions);

                if (versions['curr'] == versions['newest']) {
                    document.getElementById('bc19_version').innerText = versions['curr'] + ' (up to date)';
                    document.getElementById('bc19_update_tips').classList.add('hidden');
                } else {
                    document.getElementById('bc19_version').innerText = versions['curr'] + ' (newest is: ' + versions['newest'] + ')';
                    document.getElementById('bc19_update_tips').classList.remove('hidden');
                }
            })
        });
        
        this.replay = new Uint8Array(replay);

        this.seed = 0;
        for (let i = 0; i<4; i++) this.seed += (this.replay[i+2] << (24-8*i));

        console.log('seed: ' + this.seed);

        this.game = new Game(this.seed, 0, 0, false, false);

        // fixed game variables
        this.max_turns = ((this.replay.length - 6) / 8)

        // checkpoints is of the type [(int) turn, (Game) checkpoint]
        // checkpoints[i] is the round i
        this.checkpoints = [[0, this.game.copy()]];

        // check if we ran into that bug
        if (this.checkpoints[0][1].robots.length == 0) {
            alert('Error during map creation, try using Firefox.');
            return;
        }

        this.create_checkpoints();

        // game variables
        this.current_game = this.checkpoints[0][1];
        this.current_turn = 0;
        this.current_round = 0;
        this.current_robin = 0;

        document.getElementById('game_max_turns').innerText = this.max_turns;
        document.getElementById('game_max_rounds').innerText = this.num_rounds;
        document.getElementById('game_max_robins').innerText = this.robin_per_round[0];

        console.log(this.game);

        // viewer state
        this.is_playing = false;
        this.hover_coordinate = [-1,-1];
        this.size = this.current_game.map.length;

        this.render();
    }

    /**
     * Checkpoint the start of each round to make it easier to jump to certain positions.
     * 
     * Creates the following lookup variables:
     * - this.num_rounds := number of rounds in the game
     * - this.robin_per_round := robin count per round
     */
    create_checkpoints() {
        // first round
        var checkpoint = this.checkpoints[0][1].copy();
        var robin = 0;

        this.robin_per_round = [0];

        for (var i = 0; i < this.max_turns; ++i) {
            // check if we have ended the round
            if (robin >= checkpoint.robots.length) {
                // store a new checkpoint
                // process the turn
                var diff = this.replay.slice(6 + 8 * i, 6 + 8 * (i + 1));
                checkpoint.enactTurn(diff);

                this.checkpoints.push([i+1, checkpoint.copy()]);

                // keep track of how many robots there were
                this.robin_per_round.push(robin);

                // reset robin
                robin = 1;
            } else {
                // process the turn
                var diff = this.replay.slice(6 + 8 * i, 6 + 8 * (i + 1));
                checkpoint.enactTurn(diff);

                robin++;
            }
        }

        this.robin_per_round.push(robin - 1); // for last round
        this.num_rounds = this.checkpoints.length;
    }

    jump_to_turn(turn) {
        if (turn < 0 || turn > this.max_turns) return;

        if (turn == 0) {
            // special case
            this.current_game = this.checkpoints[0][1];
            this.current_turn = 0;
            this.current_round = 0;
            this.current_robin = 0;
            return;
        }

        // find the closest round
        var round = 0;
        while (round < this.num_rounds && this.checkpoints[round][0] <= turn) round++;
        round -= 1;

        // load the round
        var checkpoint = this.checkpoints[round][1].copy();
        var robin = 0;

        // process turns until we reach our goal
        for (var i = this.checkpoints[round][0]; i < turn; ++i) {
            var diff = this.replay.slice(6 + 8 * i, 6 + 8 * (i + 1));
            checkpoint.enactTurn(diff);
            robin++;
            // if we've calculate correctly, our robin won't overflow
        }

        this.current_round = round + 1;

        if (round > 0) {
            this.current_robin = robin + 1;
        } else {
            this.current_robin = robin;
        }

        this.current_turn = turn;
        this.current_game = checkpoint;
    }

    jump_to_round_robin(round, robin) {
        if (round < 0 || round > this.num_rounds) return;

        if (round == 0) {
            this.jump_to_turn(0);
        } else {
            var turn = this.checkpoints[round-1][0];
            if (round == 1) turn += 1;

            this.jump_to_turn(turn + robin - 1);
        }
    }

    next_turn() {
        // cancel autoplay if we reach the end
        if (this.current_turn >= this.max_turns && this.is_playing) {
            this.stop_autoplay();
        } else {
            this.jump_to_turn(this.current_turn + 1);
            this.render();
        }
    }

    prev_turn() {
        this.jump_to_turn(this.current_turn - 1);
        this.render();
    }

    next_round() {
        this.jump_to_round_robin(this.current_round + 1, 1);
        this.render();
    }

    prev_round() {
        this.jump_to_round_robin(this.current_round - 1, 1);
        this.render();
    }

    start_autoplay() {
        if (this.is_playing) return;
        this.is_playing = true;

        // disable manual buttons
        document.getElementById('btn_next_turn').classList.add('disabled')
        document.getElementById('btn_prev_turn').classList.add('disabled')
        document.getElementById('btn_next_round').classList.add('disabled')
        document.getElementById('btn_prev_round').classList.add('disabled')
        document.getElementById('btn_next_robin').classList.add('disabled')
        document.getElementById('btn_prev_robin').classList.add('disabled')

        // configure start/stop
        document.getElementById('btn_start_autoplay').classList.add('disabled')
        document.getElementById('btn_stop_autoplay').classList.remove('disabled')
        document.getElementById('btn_jump_start').classList.add('disabled')

        this.timer = setInterval(function(){
            this.next_turn();
        }.bind(this), 20);
    }

    stop_autoplay() {
        if (!this.is_playing) return;
        this.is_playing = false;

        clearInterval(this.timer);

        // enable manual buttons
        document.getElementById('btn_next_turn').classList.remove('disabled')
        document.getElementById('btn_prev_turn').classList.remove('disabled')
        document.getElementById('btn_next_round').classList.remove('disabled')
        document.getElementById('btn_prev_round').classList.remove('disabled')
        document.getElementById('btn_next_robin').classList.remove('disabled')
        document.getElementById('btn_prev_robin').classList.remove('disabled')

        // configure start/stop
        document.getElementById('btn_start_autoplay').classList.remove('disabled')
        document.getElementById('btn_stop_autoplay').classList.add('disabled')
        document.getElementById('btn_jump_start').classList.remove('disabled')
    }

    /**
     * Initialize the canvas
     */
    setup_graphics() {
        this.app = new PIXI.Application({
            autoResize: true,
            resolution: devicePixelRatio,
            backgroundColor : 0xffffff
        });
        document.getElementById('game').appendChild(this.app.view);

        // grid container so we can zoom and move around
        this.grid = new PIXI.Container();
        this.app.stage.addChild(this.grid);

        // initialize graphics object
        this.graphics = new PIXI.Graphics();
        this.grid.addChild(this.graphics);

        // initialize textures
        this.textures = Array(6);
        this.textures[0] = PIXI.Texture.from('/img/castle.png');
        this.textures[1] = PIXI.Texture.from('/img/church.png');
        this.textures[2] = PIXI.Texture.from('/img/pilgrim.png');
        this.textures[3] = PIXI.Texture.from('/img/crusader.png');
        this.textures[4] = PIXI.Texture.from('/img/prophet.png');
        this.textures[5] = PIXI.Texture.from('/img/preacher.png');

        // initialize a spritepool
        this.spritepool = Array(6);
        for (var i = 0; i < 6; ++i) {
            this.spritepool[i] = [];
            
            for (var j = 0; j < MAX_SPRITES_PER_TYPE; ++j) {
                var sprite = new PIXI.Sprite(this.textures[i]);
                sprite.anchor = new PIXI.Point(0, 0);
                sprite.visible = false;
                this.grid.addChild(sprite);
                this.spritepool[i].push(sprite);
            }
        }
        
        // interactive graphic components
        this.hover_coordinate = [-1,-1];
        this.selected_unit = -1; //index

        // set up interactive components
        this.app.ticker.add(function(delta) {
            var mouseposition = this.app.renderer.plugins.interaction.mouse.global;

            // figure out what grid coordinate this is
            var gx = Math.floor((mouseposition.x - this.grid.position.x) / (GRID_SIZE + GRID_SPACING) / this.grid.scale.x);
            var gy = Math.floor((mouseposition.y - this.grid.position.y) / (GRID_SIZE + GRID_SPACING) / this.grid.scale.x);

            if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return;

            if (gx != this.hover_coordinate[0] || gy != this.hover_coordinate[1]) {
                this.hover_coordinate = [gx, gy];
                this.render();
            }
        }.bind(this));

        // drag to move
        this.grid.interactive = true;

        function start_drag(event){
            console.log('mousedown:');
            this.select_point = event.data.getLocalPosition(this.parent);

            this.select_point.x -= this.position.x;
            this.select_point.y -= this.position.y;

            this.dragging = true;
        }

        function end_drag(){
            console.log('mouseup');
            this.dragging = false;
        }

        function do_drag(event){
            if (this.dragging) {
                console.log('drag!');
                var newPosition = event.data.getLocalPosition(this.parent);

                this.position.x = newPosition.x - this.select_point.x;
                this.position.y = newPosition.y - this.select_point.y;
            }
        }

        this.grid.on('mousedown', start_drag)
            .on('mouseup', end_drag)
            .on('mouseupoutside', end_drag)
            .on('mousemove', do_drag);

        // scroll to zoom
        document.getElementById('game').addEventListener('wheel', function(event) {
            
            // calculate target position in the grid's coordinate frame
            var px = event.x - this.grid.position.x;
            var py = event.y - this.grid.position.y;

            var zoom_amount = Math.pow(3/4, event.deltaY / 120);

            this.grid.scale.x *= zoom_amount;
            this.grid.scale.y *= zoom_amount;

            this.grid.position.x -= (px * (zoom_amount - 1));
            this.grid.position.y -= (py * (zoom_amount - 1));
        }.bind(this));
        
    }

    /**
     * Renders the game to the canvas
     */
    render() {
        if (this.current_game == undefined) return;

        // clear the graphics so we can redraw
        this.graphics.clear();

        // render a background so we can drag without issues
        this.graphics.beginFill(0xffffff);
        this.graphics.drawRect(-1000,-1000,(GRID_SIZE+GRID_SPACING)*this.size+1000,(GRID_SIZE+GRID_SPACING)*this.size+1000);
        this.graphics.endFill();

        // render tiles
        for (var y = 0; y < this.size; ++y) {
            for (var x = 0; x < this.size; ++x) {

                if (y == this.hover_coordinate[1] && x == this.hover_coordinate[0]) {
                    this.graphics.beginFill(0xff0000);
                    var gx = x * (GRID_SIZE + GRID_SPACING);
                    var gy = y * (GRID_SIZE + GRID_SPACING);
                    this.graphics.drawRect(gx-GRID_SPACING,gy-GRID_SPACING,GRID_SIZE+(2*GRID_SPACING),GRID_SIZE+(2*GRID_SPACING));
                    this.graphics.endFill();
                }

                // determine tile color
                if (this.current_game.karbonite_map[y][x]) {
                    this.graphics.beginFill(0x00ff00);
                } else if (this.current_game.fuel_map[y][x]) {
                    this.graphics.beginFill(0xffff00);
                } else if (this.current_game.map[y][x]) {
                    this.graphics.beginFill(0xcccccc);
                } else {
                    this.graphics.beginFill(0x111111);
                }

                // calculate grid position
                var gx = x * (GRID_SIZE + GRID_SPACING);
                var gy = y * (GRID_SIZE + GRID_SPACING);

                // draw it
                this.graphics.drawRect(gx,gy,GRID_SIZE,GRID_SIZE);
                this.graphics.endFill();
            }
        }

        // hide all units
        for (var i = 0; i < 6; ++i) {
            for (var j = 0; j < MAX_SPRITES_PER_TYPE; ++j) {
                this.spritepool[i][j].visible = false;
            }
        }

        var sprite_index = Array(6);
        for (var i = 0; i < 6; ++i) sprite_index[i] = 0;

        // render units
        for (var i = 0; i < this.current_game.robots.length; ++i) {
            var robot = this.current_game.robots[i];

            // check if we have enough sprites
            if (sprite_index[robot.unit] >= MAX_SPRITES_PER_TYPE) {
                throw Error("Ran out of sprites! Increase MAX_SPRITES_PER_TYPE and try again...");
            }

            var sprite = this.spritepool[robot.unit][sprite_index[robot.unit]];
            sprite_index[robot.unit]++;

            // calculate grid position
            var gx = robot.x * (GRID_SIZE + GRID_SPACING);
            var gy = robot.y * (GRID_SIZE + GRID_SPACING);

            // set up the sprite
            sprite.visible = true;
            sprite.width = GRID_SIZE;
            sprite.height = GRID_SIZE;
            sprite.position = new PIXI.Point(gx, gy);
            sprite.tint = robot.team === 0 ? 0xFF0000 : 0x0000FF;

        }

        this.write_stats();
        this.write_tooltip();
    }

    /**
     * Display all textual information for current game state
     */
    write_stats() {
        document.getElementById('game_curr_turn').innerText = this.current_turn;
        document.getElementById('game_curr_round').innerText = this.current_round;
        document.getElementById('game_curr_robin').innerText = this.current_robin;
        document.getElementById('game_max_robins').innerText = this.robin_per_round[this.current_round];

        document.getElementById('game_red_fuel').innerText = this.current_game.fuel[0];
        document.getElementById('game_blue_fuel').innerText = this.current_game.fuel[1];
        document.getElementById('game_red_karbonite').innerText = this.current_game.karbonite[0];
        document.getElementById('game_blue_karbonite').innerText = this.current_game.karbonite[1];
    
        // turn queue
        var html = '';

        for (var i = 0; i < this.current_game.robots.length; ++i) {
            var robot = this.current_game.robots[i];
            var color = robot.team == 0 ? 'red' : 'blue';
            html += `<p class='selectable ${color}' onmouseover=veww.select_unit(${i})>${i+1}: ${UNIT_NAMES[robot.unit]} [${robot.id}]</p>`
        }
        document.getElementById('turn_queue').innerHTML = html;
    }

    write_tooltip() {
        var hx = this.hover_coordinate[0];
        var hy = this.hover_coordinate[1];

        if (hx >= 0 && hx < this.size && hy >= 0 && hy < this.size) {
            // show
            document.getElementById('tooltip').classList.remove('hidden');

            document.getElementById('tile_location').innerText = '(' + hx + ', ' + hy + ')';
            document.getElementById('tile_passable').innerText = (this.current_game.map[hy][hx] ? 'true' : 'false');
            document.getElementById('tile_fuel').innerText = (this.current_game.fuel_map[hy][hx] ? 'true' : 'false');
            document.getElementById('tile_karbonite').innerText = (this.current_game.karbonite_map[hy][hx] ? 'true' : 'false');

            if (this.current_game.map[hy][hx]) document.getElementById('tile_passable').classList.add('true-val');
            else document.getElementById('tile_passable').classList.remove('true-val');

            if (this.current_game.fuel_map[hy][hx]) document.getElementById('tile_fuel').classList.add('true-val');
            else document.getElementById('tile_fuel').classList.remove('true-val');

            if (this.current_game.karbonite_map[hy][hx]) document.getElementById('tile_karbonite').classList.add('true-val');
            else document.getElementById('tile_karbonite').classList.remove('true-val');

            // search for a unit at this position
            var found_robot = false;
            for (var i = 0; i < this.current_game.robots.length; ++i) {
                var robot = this.current_game.robots[i];

                if (robot.x == hx && robot.y == hy) {
                    document.getElementById('unit_type').innerText = UNIT_NAMES[robot.unit];
                    document.getElementById('unit_id').innerText = robot.id;

                    document.getElementById('unit_signal').innerText = robot.signal;
                    document.getElementById('unit_castle_talk').innerText = robot.castle_talk;
                    
                    document.getElementById('unit_img').src = '/img/' + UNIT_NAMES[robot.unit].toLowerCase() + '.png';

                    if (robot.team == 0) {
                        document.getElementById('unit_img').classList.add('red-img');
                        document.getElementById('unit_img').classList.remove('blue-img');
                    } else {
                        document.getElementById('unit_img').classList.remove('red-img');
                        document.getElementById('unit_img').classList.add('blue-img');
                    }

                    document.getElementById('unit_health').innerText = robot.health;
                    document.getElementById('unit_health_max').innerText = SPECS.UNITS[robot.unit].STARTING_HP;
                    document.getElementById('unit_health_bar').style.width = (robot.health * 100 / SPECS.UNITS[robot.unit].STARTING_HP) + '%';

                    if (SPECS.UNITS[robot.unit].FUEL_CAPACITY == null) {
                        // not able to carry, hide that part of the tooltip
                        document.getElementById('tooltip-unit-resources').classList.add('hidden');
                    } else {
                        document.getElementById('tooltip-unit-resources').classList.remove('hidden');

                        document.getElementById('unit_fuel').innerText = robot.fuel;
                        document.getElementById('unit_fuel_max').innerText = SPECS.UNITS[robot.unit].FUEL_CAPACITY;
                        document.getElementById('unit_fuel_bar').style.width = (robot.fuel * 100 / SPECS.UNITS[robot.unit].FUEL_CAPACITY) + '%';

                        document.getElementById('unit_karbonite').innerText = robot.karbonite;
                        document.getElementById('unit_karbonite_max').innerText = SPECS.UNITS[robot.unit].KARBONITE_CAPACITY;
                        document.getElementById('unit_karbonite_bar').style.width = (robot.karbonite * 100 / SPECS.UNITS[robot.unit].KARBONITE_CAPACITY) + '%';
                    }

                    found_robot = true;
                    break;
                }
            }

            // show or hide the unit tooltip
            if (found_robot) {
                document.getElementById('tooltip-unit').classList.remove('hidden');
            } else {
                document.getElementById('tooltip-unit').classList.add('hidden');
            }

        } else {
            // hide tooltip
            document.getElementById('tooltip').classList.add('hidden');
        }
    }

    select_unit(idx) {
        if (idx != this.selected_unit) {
            this.selected_unit = idx;
            var robot = this.current_game.robots[idx];
            this.hover_coordinate = [robot.x, robot.y];
            this.render();
        }
    }
}

// initialize the veww
var veww = new Veww();
veww.setup_graphics();

window.veww = veww;

window.specs = SPECS;

window.addEventListener('resize', resize);

function resize() {
    veww.app.renderer.resize(window.innerWidth, window.innerHeight);
}

resize();

// load replay
function load_replay() {
    console.log('loading_replay')
    fetch('/replay').then(function(resp) {
        if (resp.ok) {
            resp.arrayBuffer().then(function(resp) {
                veww.process_replay(resp);
            })
        } else {
            console.log('no replay file');
            window.location.href = '/settings';
        }
    });
}

load_replay();

// listen for file updates and reload
var socket = io();
socket.on('file_update', load_replay);

// add click listeners
document.getElementById('btn_next_turn').onclick = function(){
    if (!veww.is_playing) veww.next_turn();
}

document.getElementById('btn_prev_turn').onclick = function(){
    if (!veww.is_playing) veww.prev_turn();
}

document.getElementById('btn_next_round').onclick = function(){
    if (!veww.is_playing) veww.next_round();
}

document.getElementById('btn_prev_round').onclick = function(){
    if (!veww.is_playing) veww.prev_round();
}

document.getElementById('btn_next_robin').onclick = function(){
    if (!veww.is_playing) veww.next_turn();
}

document.getElementById('btn_prev_robin').onclick = function(){
    if (!veww.is_playing) veww.prev_turn();
}

document.getElementById('btn_start_autoplay').onclick = function(){
    veww.start_autoplay();
}

document.getElementById('btn_stop_autoplay').onclick = function(){
    veww.stop_autoplay();
}

document.getElementById('btn_jump_start').onclick = function(){
    if (!veww.is_playing) {
        veww.jump_to_turn(0);
        veww.render();
    }
}

document.getElementById('btn_set_turn').onclick = function(){
    if (!veww.is_playing) {
        var turn = parseInt(document.getElementById('input_set_turn').value);
        veww.jump_to_turn(turn);
        veww.render();
    }
}

document.getElementById('btn_set_round').onclick = function(){
    if (!veww.is_playing) {
        var round = parseInt(document.getElementById('input_set_round').value);
        veww.jump_to_round_robin(round, 1);
        veww.render();
    }
}
