import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';

const stdinDecoder = new TextDecoder('utf-8');

const log = console.log;


function findPointerWindow() {
    let target = null;
    let [pointerX, pointerY, ] = global.get_pointer();
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

function pressKey(combination) {
	// if (typeof combination === 'string') {
	// 	combination = [combination];
	// }
	log('pressing ' + combination.join('+'))
	combination.forEach(key => {
		const KEY = Clutter[`KEY_${key}`];
		if (!KEY) log(`unknow key "${KEY}"`)
		_virtualKeyboard.notify_keyval(
			Clutter.get_current_event_time(), KEY, Clutter.KeyState.PRESSED
		)
	});
	combination.reverse().forEach(key =>
		_virtualKeyboard.notify_keyval(
			Clutter.get_current_event_time(), Clutter[`KEY_${key}`], Clutter.KeyState.RELEASED
	));
}

let pressed = new Set([]);

function keyDown(key) {
	log(`keydown ${key}`)
	_virtualKeyboard.notify_keyval(
		Clutter.get_current_event_time(),
		Clutter[`KEY_${key}`],
		Clutter.KeyState.PRESSED
	);
	pressed.add(key);
}

function keyUp(key) {
	if (pressed.delete(key)) {
		log(`keyup ${key}`)
		_virtualKeyboard.notify_keyval(
			Clutter.get_current_event_time(),
			Clutter[`KEY_${key}`],
			Clutter.KeyState.RELEASED
		);
		return;
	} else {
		log(`keyUp(${key}) called, but ${key} is not down, ignoring`);
	}
}

function maximizeWin(win) {
	win.maximize(Meta.MaximizeFlags.BOTH);
}

function shiftPressed() {
    return global.get_pointer()[2] & Clutter.ModifierType.SHIFT_MASK;
}

function _changeWS_kb(move) {
	if (move == -1) {
		pressKey(['Super_L', 'Prior']);
	} else if (move == 1) {
		pressKey(['Super_L', 'Next']);
	}
}

class DummyKeyBinding {
	constructor(name) {
		this.name = name;
	}

	get_name() {
		return this.name;
	}
}

function _changeWS_gnome(move, move_win) { // int move is how much to move by
	// calling https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js

	let dir;
	if (move == 1) {
		dir = 'right';
	} else if (move == -1) {
		dir = 'left';
	} else {
		log(`don't understand argument ${move} to _changeWS_gnome`)
		return
	}
	let action = 'switch'
	if (move_win) {
		action = 'move'
	}
	Main.wm._showWorkspaceSwitcher(
		global.display, active_win, new DummyKeyBinding(`${action}---${dir}`)
	);
}

function changeWS(move, move_win) {
	if (move_win === undefined) {
		move_win = shiftPressed()
	}
	_changeWS_gnome(move, move_win);
}

let active_win;
let restore_win;
// let needs_raise = false;

function getWindow() {
	restore_win = global.display.get_focus_window();
	if (restore_win && restore_win.get_wm_class() == 'Guake') {
		active_win = restore_win;
	} else {
		active_win = findPointerWindow() || restore_win;
	}
	// needs_raise = false; // defensive
}

function doFocusing() {
	if (active_win && active_win != restore_win) {
        active_win.focus(Meta.CURRENT_TIME);
	}
}

function switchWinBack() {
	// log(`switching back to ${restore_win?.get_wm_class()}${needs_raise ? ' and raising' : ''}`)
	const current_win = global.display.get_focus_window()?.get_wm_class()
	if (restore_win == null || restore_win == current_win) return;

	log(`switching back to ${restore_win?.get_wm_class()} from ${current_win}`)
	restore_win.focus(Meta.CURRENT_TIME);
	restore_win.activate(Meta.CURRENT_TIME);
	// restore_win.activate(Meta.CURRENT_TIME);
	// if (needs_raise) {
	// 	restore_win.raise();
	// }
	active_win = restore_win = null;
	// needs_raise = false;
}

function get_wmclass() {
	return (active_win || global.display.get_focus_window())?.get_wm_class() || 'root'
}

function get_title() {
	return (active_win || global.display.get_focus_window())?.get_title() || 'GNOME'
}


function three_finger_begin() {
	if (Date.now() - hold_time < 1000) {
		wm_mode = true;
	} else { // four_finger_hold already takes care of this
		getWindow();
		doFocusing();
	}
}

function three_finger_end() {
	if (wm_mode) {
		wm_mode = false; // not switching back
	}
	if (esp) {
		evinceTabFinish();
		if (restore_win.get_wm_class() == "Evince") {
			active_win = restore_win = null
			return;
		}
		// needs_raise = true;
		switchWinBack();

		// we need to wait for the alt-tab switch to take effect before we switch back
        // const handler = tracker.connect('notify::focus-app', () => {
		//	switchWinBack();
		// 	tracker.disconnect(handler);
		// });
	} else {
		switchWinBack();
	}
}

let wsp = null;
function altTab(move) {
	// if (move == 1) {
	// 	pressKey(['Tab']);
	// 	switcher_active = true;
	// } else if (move == -1) {
	// 	if (!switcher_active) {
	// 		pressKey(['Shift_L', 'Tab']);
	// 		switcher_active = true;
	// 	} else {
	// 		pressKey(['Left']);
	// 	}
	// }

	if (!wsp) {
		wsp = new AltTab.WindowSwitcherPopup();
		wsp.show();
		if (move == -1) {
			wsp._select(wsp._items.length - 1);
		}
	} else {
		if (move == 1) {
			wsp._select(wsp._next());
		}
		else if (move == -1) {
			wsp._select(wsp._previous());
		}
	}
}

function altTabBegin() {
	// keyDown('Alt_L');
	// wm_mode = wm_mode_tiling = false; // defensive
	// switcher_active = false;
}

function altTabFinish() {
	// keyUp('Alt_L');
	// switcher_active = false
	if (wsp) {
		wsp._finish();
		// wsp.destroy(); //_finish() already destroys
		wsp = null;
	}
}

let esp = null;
function evinceTab(move) {
	// if (move == 1) {
	// 	if (!evince_switcher_active) {
	// 		Main.panel.statusArea.quickSettings.menu.close();
	// 		Main.panel.statusArea.dateMenu.menu.close();
	// 		keyDown('Alt_L');
	// 		pressKey(['Shift_L', 'grave']);
	// 		evince_switcher_active = true;
	// 	} else {
	// 		pressKey(['Left']);
	// 	}
	// } else if (move == -1) {
	// 	if (!evince_switcher_active) {
	// 		Main.panel.statusArea.quickSettings.menu.close();
	// 		Main.panel.statusArea.dateMenu.menu.close();
	// 		keyDown('Alt_L');
	// 		evince_switcher_active = true;
	// 	}
	// 	pressKey(['grave']);
	// }
	if (!esp) {
		esp = new AltTab.WindowSwitcherPopup();
		let evince = tracker.get_window_app(active_win);
		esp._singleApp = [evince.get_id(), evince.get_name()];
		esp.show();
		if (move == -1) {
			esp._select(esp._items.length - 1);
		}
	} else {
		if (move == 1) {
			esp._select(esp._next());
		}
		else if (move == -1) {
			esp._select(esp._previous());
		}
	}
}

function evinceTabFinish() {
	// keyUp('Alt_L');
	// switcher_active = false
	if (esp) {
		esp._finish();
		// esp.destroy(); //_finish() already destroys
		esp = null;
	}
}


function three_finger_right() {
	switch (get_wmclass()) {
		case "Spotify":
			// ydotool()
			pressKey(['AudioNext']);
			break;
		case "Evince":
			evinceTab(-1);
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
			evinceTab(1);
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
	log(wm_mode);
	if (wm_mode) {
		pressKey(['Super_L', 'Shift_L', 'Up']);
		return;
	}
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
			} else if (/^(man |run-help |mpv:|mpa:|h?top).*/.test(title)) {
				pressKey(['q']);
			} else {
				pressKey(['Control_L', 'F4']);
			}
			break;
		case "Evince":
			if (esp) {
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
	log(wm_mode);
	if (wm_mode) {
		pressKey(['Super_L', 'Shift_L', 'Down']);
		return;
	}
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
	restore_win = active_win;
	// needs_raise = true;
}

function notify_wm_mode() {
	Main.osdWindowManager.show(
		-1, Gio.icon_new_for_string('view-grid-symbolic'), null, null, null
	)
}

let wm_mode = false;
let wm_mode_tiling = false;
let hold_time = -1;

function four_finger_hold() {
	hold_time = Date.now();
	// Main.notify('fusuma server', 'window manager mode');
	notify_wm_mode();
	getWindow();
	doFocusing();
}

function four_finger_begin() {
	if (Date.now() - hold_time < 1000) {
		wm_mode = true;
		wm_mode_tiling = false;
	} else {
		altTabBegin();
	}
}

function four_finger_end() {
	if (wm_mode_tiling) {
		pressKey(['Return']);
	} else if (wm_mode) {
		switchWinBack();
	} else {
		altTabFinish();
	}
	wm_mode = wm_mode_tiling = false;
	hold_time = -1;

}

function four_finger_left() {
	if (wm_mode) {
		pressKey(['Super_L', 'Left']);
		wm_mode = false;
		wm_mode_tiling = true;
	} else if (wm_mode_tiling) {
		pressKey(['Right']);
	} else {
		altTab(1);
		// if (!wsp) {
		// 	wsp = new AltTab.WindowSwitcherPopup();
		// 	wsp.show();
		// } else {
		// 	wsp._select(wsp._next());
		// }
	}
}

function four_finger_right() {
	if (wm_mode) {
		pressKey(['Super_L', 'Right']);
		wm_mode = false;
		wm_mode_tiling = true;
	} else if (wm_mode_tiling) {
		pressKey(['Left']);
	} else {
		altTab(-1);
	}
}

function four_finger_down() {
	if (wm_mode) {
		getWindow();
		changeWS(-1, true);
	} else if (wm_mode_tiling) {
	} else {
		// if (!switcher_active) {
		if (!wsp) {
			getWindow();
			// keyUp('Alt_L');
			changeWS(-1);
		}
	}
}

function four_finger_up() {
	if (wm_mode) {
		getWindow();
		changeWS(1, true);
	} else if (wm_mode_tiling) {
		pressKey(['Escape']);
	} else {
		if (wsp) {
			// pressKey(['w']);
			wsp._closeWindow(wsp._selectedIndex);
		} else {
			// keyUp('Alt_L');
			getWindow();
			changeWS(1);
		}
	}
}


function changeFullscreen(win, state) {
	// win should not be null
	switch (win.get_wm_class()) {
		case "vlc":
			keyPress(['f']);
		default:
			if (state) {
				win.make_fullscreen();
			} else {
				win.unmake_fullscreen();
			}
	}
}

function pinch_two_start() {
	getWindow();
	if (active_win == 'Evince') {
		
	}
}

const NEVER_PINCH_APPS = new Set(['Evince', 'Xournalpp', 'Eog']);
function pinch_two_in() {
	getWindow();
	if (!active_win || NEVER_PINCH_APPS.has(get_wmclass())) {
		active_win = restore_win = null;
		return;
	}
	
	if (active_win.is_fullscreen()) {
		changeFullscreen(active_win, false);
	} else if (active_win.get_maximized() && get_wmclass() != 'firefox') {
		active_win.unmaximize(Meta.MaximizeFlags.BOTH);
	}
	active_win = restore_win = null;
}

function pinch_two_out() {
	getWindow();
	if (!active_win || NEVER_PINCH_APPS.has(get_wmclass())) {
		active_win = restore_win = null;
		return;
	}

	if (get_wmclass() == 'firefox') {
		// if (/(FMovies|YouTube|odysee|tagesschau\.de|prime video|Picture-in-Picture)/.test(get_title())) {
		// 	log('video site in FF detected - going fullscreen');
		// 	pressKey(['Control_L', '0']);
		// 	pressKey(['F']);
		// }
	} else if (!active_win.get_maximized()) {
		active_win.maximize(Meta.MaximizeFlags.BOTH);
	} else if (!active_win.is_fullscreen()) {
		changeFullscreen(active_win, true);
	}
	active_win = restore_win = null;
}

function pinch_three_in() {
	Main.overview.toggle();
};

function pinch_three_out() {
	getWindow();
	if (get_wmclass() == 'firefox' &&
		/(FMovies|YouTube|odysee|tagesschau\.de|prime video|Picture-in-Picture)/.test(get_title())
	) {
		log('video site in FF detected - going fullscreen');
		doFocusing();
		pressKey(['f']);
		switchWinBack();
	} else if (!active_win.get_maximized()) {
		active_win.maximize(Meta.MaximizeFlags.BOTH);
	} else if (!active_win.is_fullscreen()) {
		if (get_wmclass() == 'Evince') {
			pressKey(['w']);
		} else {
			changeFullscreen(active_win, true);
		}
	}
	active_win = restore_win = null;
}

function pinch_four_out() {
	getWindow();
	doFocusing();
	switch (get_wmclass()) {
		case 'Evince':
			pressKey(['d']);
			break;
		default:
			pressKey(['Alt_L', 'Right']);
			break;
	}
	// switchWinBack();
}

function pinch_four_in() {
	getWindow();
	doFocusing();
	switch (get_wmclass()) {
		case 'Evince':
			pressKey(['F9']);
			break;
		default:
			pressKey(['Alt_L', 'Left']);
			break;
	}
	// switchWinBack();
}

function pinch_four_end() {
	switchWinBack();
}

// Clutter.init(null);
// Clutter.main();

let FUNS = {};
['three', 'four'].forEach(num => {
	['up', 'down', 'left', 'right', 'begin', 'end', 'hold'].forEach(dir => {
		const name = `${num}_finger_${dir}`;
		try {
			FUNS[name] = eval(name);
		} catch (ReferenceError) {};
	});
});
['two', 'three', 'four'].forEach(num => {
	['in', 'out', 'start', 'end'].forEach(dir => {
		const name = `pinch_${num}_${dir}`;
		try {
			FUNS[name] = eval(name);
		} catch (ReferenceError) {};
	});
});

function cb(pipe, res) {
	// dis = new Gio.DataInputStream({ base_stream: pipe.read_finish(res) });
	dis = new Gio.DataInputStream({ base_stream: pipe.read_finish(res) });
	dis.read_line_async(0, null, line_reader);
};

function line_reader(dis, res) {
	const [out, length] = dis.read_line_finish(res);
	if (length > 0) {
		input = stdinDecoder.decode(out).trim();
		log(`> ${input}`);
		handle_input(input);
		dis.read_line_async(0, null, line_reader);
	} else {
		Clutter.main_quit();
	};
};

function handle_input(cmd) {
	if (cmd in FUNS) {
		// print(`executing! (t = ${Date.now()})`);
		try {
			FUNS[cmd]();
		} catch (e) {
			console.error(e, e.stack);
		}
	};
};


let pipe;
let keep_open;

let input;
let dis;

let _virtualKeyboard;
let _virtualTouchpad;
const PIPE_PATH = `${GLib.getenv('XDG_RUNTIME_DIR')}/fusuma_fifo`;
let tracker;

export default class FusumaServerExtension {
    enable() {
		pipe = Gio.File.new_for_path(PIPE_PATH)
		keep_open = pipe.open_readwrite(null);
		pipe.read_async(0, null, cb);

		const seat = Clutter.get_default_backend().get_default_seat();
		_virtualKeyboard = seat.create_virtual_device(
			Clutter.InputDeviceType.KEYBOARD_DEVICE
		);
		_virtualTouchpad = seat.create_virtual_device(
			Clutter.InputDeviceType.POINTER_DEVICE
		);
		tracker = Shell.WindowTracker.get_default();
		// global.stage.connect('key-press-event', (self, event) => (log('key event')));

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


