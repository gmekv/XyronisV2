/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 */

import { Container, Image, Root, Text } from '@pmndrs/uikit';
import { Group, Raycaster } from 'three';
import { System } from 'elics';
import { XR_BUTTONS } from 'gamepad-wrapper';
import chairs from './search.json';
import { globals } from './global';

const ITEM_PER_ROW = 4;
const DIRECTIONS = {
    Up: 'up',
    Down: 'down',
    Left: 'left',
    Right: 'right',
    None: 'none',
};

export class UIPanelSystem extends System {
    init() {
        console.log('UIPanelSystem init started');
        const { camera, renderer, scene } = globals;
        console.log('Globals in init:', { camera: !!camera, renderer: !!renderer, scene: !!scene });
        this._raycaster = new Raycaster();
        this._panelAnchor = new Group();
        this._root = new Root(camera, renderer, undefined, {
            flexDirection: 'column',
            justifyContent: 'space-evenly',
            alignItems: 'flex-start',
            backgroundColor: 'white',
            borderRadius: 1.5,
            backgroundOpacity: 0.7,
            padding: 0.6,
            gap: 0.5,
        });
        this._root.visible = globals.currentMode === 'furniture';

        console.log('Root created, adding to scene');
        scene.add(this._panelAnchor);
        this._panelAnchor.add(this._root);
        console.log('Panel anchor added to scene, root visibility:', this._root.visible);

        this._selectionCoords = [0, 0];
        this._itemGrid = [];
        this._prevDirection = DIRECTIONS.None;

        let rowContainer = null;
        let gridRow = null;
        chairs.forEach((chair, i) => {
            if (i % ITEM_PER_ROW === 0) {
                rowContainer = new Container({
                    flexDirection: 'row',
                    justifyContent: 'space-evenly',
                    alignItems: 'flex-start',
                    gap: 0.5,
                });
                this._root.add(rowContainer);
                gridRow = [];
                this._itemGrid.push(gridRow);
                console.log('New row added, grid length:', this._itemGrid.length);
            }

            const itemImage = new Image({
                src: 'assets/' + chair.image_path,
                width: 5,
                minWidth: 5,
                maxWidth: 5,
                minHeight: 5,
                height: 5,
                maxHeight: 5,
                objectFit: 'fill',
                borderRadius: 1,
                backgroundColor: 'white',
                borderWidth: 0.25,
                borderColor: 'white',
            });
            itemImage.userData.modelURL = chair['3dmodel_id'];
            gridRow.push(itemImage);

            const itemContainer = new Container({
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
            })
                .add(itemImage)
                .add(
                    new Text(chair.item_id, {
                        fontSize: 0.7,
                        fontWeight: 'extra-bold',
                        color: 'black',
                        textAlign: 'center',
                    }),
                );

            rowContainer.add(itemContainer);
            if (i === 0) console.log('First item added:', chair.item_id);
        });
        this._itemGrid[0][0].setStyle({
            borderColor: 'black',
        });
        console.log('UIPanelSystem init completed, initial mode:', globals.currentMode);
    }

    update(delta) {
        console.log('Update called, delta:', delta);
        const controller = globals.controllers['left'];
        console.log('Left controller detected:', !!controller);
        if (controller) {
            console.log('Controller position:', controller.targetRaySpace.position);
            controller.targetRaySpace.getWorldPosition(this._panelAnchor.position);
            this._panelAnchor.position.y += 0.1;
            this._panelAnchor.lookAt(globals.playerHead.position);
            console.log('Panel anchor updated, position:', this._panelAnchor.position);

            const gamepad = controller.gamepadWrapper;
            console.log('Gamepad available:', !!gamepad);

            // Mode switching with X button
            if (gamepad) {
                const xButtonPressed = gamepad.getButtonClick(XR_BUTTONS.BUTTON_1);
                console.log('X button click checked:', xButtonPressed);
                if (xButtonPressed) {
                    console.log('Before mode switch, currentMode:', globals.currentMode);
                    globals.currentMode = globals.currentMode === 'furniture' ? 'measurement' : 'furniture';
                    this._root.visible = globals.currentMode === 'furniture';
                    console.log('Mode switched to:', globals.currentMode, 'Root visible:', this._root.visible);
                }
            }

            // Only process furniture UI if in furniture mode
            console.log('Current mode check:', globals.currentMode);
            if (globals.currentMode === 'furniture') {
                console.log('Entering furniture mode logic');
                if (gamepad?.get2DInputValue(XR_BUTTONS.THUMBSTICK) > 0.7) {
                    const angle = gamepad.get2DInputAngle(XR_BUTTONS.THUMBSTICK);
                    console.log('Thumbstick angle:', angle);
                    let direction = DIRECTIONS.None;
                    if (Math.abs(angle) < Math.PI / 6) {
                        direction = DIRECTIONS.Up;
                    } else if (Math.abs(angle) > (Math.PI / 6) * 5) {
                        direction = DIRECTIONS.Down;
                    } else if (
                        Math.abs(angle) > Math.PI / 3 &&
                        Math.abs(angle) < (Math.PI / 3) * 2
                    ) {
                        if (angle > 0) {
                            direction = DIRECTIONS.Right;
                        } else {
                            direction = DIRECTIONS.Left;
                        }
                    }
                    console.log('Direction determined:', direction);
                    if (direction !== DIRECTIONS.None && direction !== this._prevDirection) {
                        const [currentRow, currentCol] = this._selectionCoords;
                        let newCoords = [...this._selectionCoords];
                        console.log('Current selection coords:', currentRow, currentCol);

                        switch (direction) {
                            case DIRECTIONS.Up:
                                newCoords[0] = currentRow - 1;
                                break;
                            case DIRECTIONS.Down:
                                newCoords[0] = currentRow + 1;
                                break;
                            case DIRECTIONS.Left:
                                newCoords[1] = currentCol - 1;
                                break;
                            case DIRECTIONS.Right:
                                newCoords[1] = currentCol + 1;
                                break;
                        }

                        const [newRow, newCol] = newCoords;
                        console.log('New coords calculated:', newRow, newCol);
                        if (
                            newRow >= 0 &&
                            newRow < this._itemGrid.length &&
                            newCol >= 0 &&
                            newCol < this._itemGrid[newRow].length
                        ) {
                            this._selectionCoords = newCoords;
                            this._itemGrid[currentRow][currentCol].setStyle({
                                borderColor: 'white',
                            });
                            this._itemGrid[newRow][newCol].setStyle({
                                borderColor: 'black',
                            });
                            console.log('Selection updated to:', newRow, newCol);
                        } else {
                            console.log('New coords out of bounds');
                        }
                    }
                    this._prevDirection = direction;
                    console.log('Previous direction updated:', this._prevDirection);
                } else {
                    this._prevDirection = DIRECTIONS.None;
                    console.log('Thumbstick not active, prevDirection reset:', this._prevDirection);
                }

                if (gamepad?.getButtonDown(XR_BUTTONS.TRIGGER)) {
                    console.log('Trigger button pressed');
                    const [currentRow, currentCol] = this._selectionCoords;
                    globals.furnitureToSpawn = this._itemGrid[currentRow][currentCol].userData.modelURL;
                    console.log('Furniture to spawn set:', globals.furnitureToSpawn);
                }
            }
        }
        if (this._root) {
            console.log('Updating root, visibility:', this._root.visible);
            this._root.update(delta * 1000);
        } else {
            console.log('Root not found');
        }
        console.log('Update cycle completed');
    }
}