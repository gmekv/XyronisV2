
import { System } from 'elics';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { globals } from './global';

export class UIPanelSystem extends System {
    init() {
        console.log('UIPanelSystem init started');
    }

    update(delta) {
        const controller = globals.controllers['left'];
        
        if (controller) {
            const gamepad = controller.gamepadWrapper;

            // Mode switching with X button
            if (gamepad) {
                const xButtonPressed = gamepad.getButtonClick(XR_BUTTONS.BUTTON_1);
                if (xButtonPressed) {
                    globals.currentMode = globals.currentMode === 'furniture' ? 'measurement' : 'furniture';
                    console.log('Mode switched to:', globals.currentMode);
                }
            }
        }
    }
}