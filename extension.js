import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// import {Key} from "./keycodes.js"

const stdinDecoder = new TextDecoder('utf-8');

const log = console.log;

let FUNS = new Set([]);
['three', 'four'].forEach(num => {
		['up', 'down', 'left', 'right', 'begin', 'end'].forEach(dir => {
				FUNS.add(`${num}_finger_${dir}`)
			});
	});
['two', 'three', 'four'].forEach(num => {
		['in', 'out'].forEach(dir => {
				FUNS.add(`pinch_${num}_${dir}`);
			});
	});

function findPointerWindow() {
    let target = null;
    let [pointerX, pointerY, pointerZ] = global.get_pointer();
    let currActor = global.stage.get_actor_at_pos(
        Clutter.PickMode.REACTIVE, pointerX, pointerY
    );
    if (currActor) {
        // Find root window for current actor
        let currWindow = currActor.get_parent();
        let i = 0;
        while (currWindow && !currWindow.get_meta_window) {
            currWindow = currWindow.get_parent();
            if (!currWindow || (++i > 10)) {
                currWindow = null;
                break;
            }
        }
        // Set meta window as target window to manage
        target = currWindow?.get_meta_window();
    }
    return target;
}

// function pressKey(combination) {
// 	combination.forEach(key => _virtualKeyboard.notify_keyval(
// 		Clutter.get_current_event_time(), key, Clutter.KeyState.PRESSED)
// 	);
// 	combination.reverse().forEach(key =>
// 		_virtualKeyboard.notify_keyval(
// 			Clutter.get_current_event_time(), key, Clutter.KeyState.RELEASED
// 	));
// }

function pressKey(combination) {
	// if (typeof combination === 'string') {
	// 	combination = [combination];
	// }
	combination.forEach(key => _virtualKeyboard.notify_keyval(
		Clutter.get_current_event_time(), Clutter[`KEY_${key}`], Clutter.KeyState.PRESSED)
	);
	combination.reverse().forEach(key =>
		_virtualKeyboard.notify_keyval(
			Clutter.get_current_event_time(), Clutter[`KEY_${key}`], Clutter.KeyState.RELEASED
	));
}

function keyDown(key) {
	_virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter[`KEY_${key}`], Clutter.KeyState.PRESSED);
}

function keyUp(key) {
	_virtualKeyboard.notify_keyval(Clutter.get_current_event_time(), Clutter[`KEY_${key}`], Clutter.KeyState.RELEASED);
}

function maximizeWin(win) {
	win.maximize(Meta.MaximizeFlags.BOTH);
}

let active_win;
let restore_win;

function doFocusing() {
	restore_win = global.display.get_focus_window();
	if (restore_win && restore_win.get_wm_class() == 'Guake') {
		active_win = restore_win;
	} else {
		active_win = findPointerWindow();
	}

	if (active_win != restore_win) {
        active_win.focus(Meta.CURRENT_TIME);
	}
}

function switchWinBack(needs_raise=false) {
	if (restore_win == null) return;
	restore_win.focus(Meta.CURRENT_TIME);
	if (needs_raise) {
		restore_win.raise(Meta.CURRENT_TIME);
	}
	active_win = restore_win = null;
}

function get_wmclass() {
	return (active_win || global.display.get_focus_window())?.get_wm_class() || 'root'
}

function get_title() {
	return (active_win || global.display.get_focus_window())?.get_title() || 'GNOME'
}

function pinch_three_in() {
	Main.overview.toggle();
};

function three_finger_begin() {
	doFocusing();
}

let evince_switcher_active = false;

function three_finger_end() {
	if (evince_switcher_active) {
		keyUp('Alt_L');
		evince_switcher_active = false;
		if (restore_win.get_wm_class() != "Evince") {
			switchWinBack(true);
		}
	} else {
		switchWinBack();
	}
}

function three_finger_right() {
	switch (get_wmclass()) {
		case "Spotify":
			// ydotool()
			pressKey(['AudioNext']);
			break;
		case "Evince":
			if (!evince_switcher_active) {
				keyDown('Alt_L');
				pressKey(['Shift_L', 'grave']);
			} else {
				pressKey(['Right']);
			}
			active_win = global.display.get_focus_window();
			break;
		case "gnome-calendar":
			pressKey(['Prior']);
			break;
		default:
			pressKey(['Control_L', 'Prior']);
			break;
	}
}

function three_finger_left() {
	switch (get_wmclass()) {
		case "Spotify":
			// ydotool()
			pressKey(['AudioPrev']);
			break;
		case "Evince":
			if (!evince_switcher_active) {
				keyDown('Alt_L');
			}
			pressKey(['grave']);
			active_win = global.display.get_focus_window();
			break;
		case "gnome-calendar":
			pressKey(['Next']);
			break;
		default:
			pressKey(['Control_L', 'Next']);
			break;
	}
}

function three_finger_up() {
	switch (get_wmclass()) {
		case "Tilix":
		case "Guake":
			pressKey(['Control_L', 'W']);
			break;
		case "firefox":
		case "firefox-aurora":
		case "Tor Browser":
		case "Chromium-browser":
			pressKey(['Control_L', 'F4']);
			break;
		case "kitty":
			const title = get_title();
			if (title.startsWith('vi:') || title === "Clicked command output") {
				pressKey(['Escape']);
				// keyDown('Shift_L');
				pressKey(['Z']);
				pressKey(['Q']);
				// keyUp('Shift_L');
			} else if (/^(man |run-help |mpv:|mpa:).*/.test(title)) {
				pressKey(['q']);
			} else {
				pressKey(['Control_L', 'F4']);
			}
			break;
		case "Evince":
			if (evince_switcher_active) {
				pressKey(['W']);
			} else {
				pressKey(['Alt_L', 'F4']);
			}
			break;
		default:
			pressKey(['Control_L', 'w']);
			break;
	}
}

let ff_newtab = -1;

function three_finger_down() {
	switch (get_wmclass()) {
		case "Tilix":
		case "Guake":
		case "kitty":
			pressKey(['Control_L', 'T']);
			restore_win = active_win;
			break;
		case "TeXstudio":
			pressKey(['Control_L', 'n']);
			restore_win = active_win;
			break;
		case "firefox":
		case "firefox-aurora":
		case "Tor Browser":
		case "Chromium-browser":
			if (ff_newtab >= 0 && Date.now() - ff_newtab < 800) {
				pressKey(['Control_L', 'F4']);
				pressKey(['Control_L', 'T']);
				ff_newtab = -1;
			} else {
				pressKey(['Control_L', 't']);
				ff_newtab=Date.now();
			}
			restore_win = active_win;
			break;
		case "Evince":
			maximizeWin(active_win);
			break;
		default:
			pressKey(['Control_L', 'T']);
			break;
	}
}


let hold_wm_mode = false;

function four_finger_hold() {
	hold_wm_mode
}

// Clutter.init(null);
// Clutter.main();


function cb(pipe, res) {
	// dis = new Gio.DataInputStream({ base_stream: pipe.read_finish(res) });
	dis = new Gio.DataInputStream({ base_stream: pipe.read_finish(res) });
	dis.read_line_async(0, null, line_reader);
};

function line_reader(dis, res) {
	const [out, length] = dis.read_line_finish(res);
	if (length > 0) {
		input = stdinDecoder.decode(out).trim();
		print(`> ${input}`);
		handle_input(input);
		dis.read_line_async(0, null, line_reader);
	} else {
		Clutter.main_quit();
	};
};

function handle_input(cmd) {
	if (FUNS.has(cmd)) {
		print('executing!');
		try {
			eval(cmd + '()');
		} catch (e) {
			console.error(e, e.stack);
		}
	};
};


// let old_win;
// let old_win_class;
// let old_win_title;

let pipe;
let keep_open;

let input;
let dis;

let _virtualKeyboard;
const PIPE_PATH = `${GLib.getenv('XDG_RUNTIME_DIR')}/fusuma_fifo`;

export default class FusumaServerExtension {
    enable() {
		pipe = Gio.File.new_for_path(PIPE_PATH)
		keep_open = pipe.open_readwrite(null);
		pipe.read_async(0, null, cb);

		const seat = Clutter.get_default_backend().get_default_seat();
		_virtualKeyboard = seat.create_virtual_device(
			Clutter.InputDeviceType.KEYBOARD_DEVICE
		);

   //      Shell.WindowTracker.get_default().connect('notify::focus-app', () => {
   //          // old_win = global.display.focus_window;
   //          old_win_class = win ? win.get_wm_class() : 'root';
   //          old_win_title = win ? win.get_title() : '';

			// // TODO do I need this?
   //          // var id = win ? win.get_description() : '-1';
   //          // if (id.substring(0, 2) == '0x') {
   //          //     id = parseInt(id.substring(2), 16);
   //          // } else {
   //          //     id = '-1';
   //          // }
   //      });

    }

    disable() {

    }
}

