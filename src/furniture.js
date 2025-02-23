/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 */
import { AXES, XR_BUTTONS } from 'gamepad-wrapper';
import {
    Group,
    LoadingManager,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    Raycaster,
    ShadowMaterial,
    SphereGeometry,
    Vector3,
} from 'three';

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { System } from 'elics';
import { createFurnitureMarker } from './marker';
import { globals } from './global';

export class FurnitureSystem extends System {
    init() {
        this.raycaster = new Raycaster();
        const manager = new LoadingManager();
        const DRACO_LOADER = new DRACOLoader(this.manager).setDecoderPath(
            `vendor/draco/gltf/`,
        );
        const KTX2_LOADER = new KTX2Loader(this.manager).setTranscoderPath(
            `vendor/basis/`,
        );
        const gltfLoader = new GLTFLoader(manager)
            .setCrossOrigin('anonymous')
            .setDRACOLoader(DRACO_LOADER)
            .setKTX2Loader(KTX2_LOADER.detectSupport(globals.renderer));
        this._gltfLoader = gltfLoader;
        import('@dimforge/rapier3d').then((RAPIER) => {
            this.RAPIER = RAPIER;
            let gravity = { x: 0.0, y: -9.81, z: 0.0 };
            let world = new RAPIER.World(gravity);

            let groundColliderDesc = RAPIER.ColliderDesc.cuboid(
                10.0,
                0,
                10.0,
            ).setFriction(0.5);
            this.floorCollider = world.createCollider(groundColliderDesc);

            let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(0.0, 3.0, 0.0)
                .setAngularDamping(1)
                .lockRotations();
            let rigidBody = world.createRigidBody(rigidBodyDesc);
            rigidBody.setEnabledRotations(false, true, false);

            let colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(
                0,
            );
            world.createCollider(colliderDesc, rigidBody);

            this.rapierWorld = world;
            this.rigidBody = rigidBody;
        });
        this._furnitureLoading = false;
    }

    update(delta) {
        if (!this.RAPIER) return;

        // Mode-based visibility control
        if (globals.currentMode !== 'furniture') {
            if (this.cube) {
                this.cube.visible = false;
            }
            if (this.targetMarker) {
                this.targetMarker.visible = false;
            }
            return;
        }

        // Show placement preview when in furniture mode
        if (this.cube) {
            this.cube.visible = true;
        }
        if (this.targetMarker) {
            this.targetMarker.visible = true;
        }

        if (!this.cube) {
            const { ratk, scene } = globals;
            this.cube = new Group();
            const furnitureMarker = createFurnitureMarker();
            furnitureMarker.position.set(0, -0.5, 0);
            this.cube.add(furnitureMarker);
            scene.add(this.cube);

            const floorGeometry = new PlaneGeometry(1000, 1000);
            floorGeometry.rotateX(-Math.PI / 2);
            this.floor = new Mesh(
                floorGeometry,
                new ShadowMaterial({
                    opacity: 0.75,
                }),
            );
            this.floor.receiveShadow = true;
            scene.add(this.floor);

            this.targetMarker = new Mesh(
                new SphereGeometry(0.05, 32, 16),
                new MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.5,
                }),
            );
            scene.add(this.targetMarker);

            ratk.onPlaneAdded = (plane) => {
                plane.visible = false;
                if (plane.orientation === 'vertical') {
                    const wallColliderDesc = this.RAPIER.ColliderDesc.cuboid(
                        plane.boundingRectangleWidth,
                        0,
                        plane.boundingRectangleHeight,
                    )
                        .setTranslation(...plane.position.toArray())
                        .setRotation(plane.quaternion);
                    this.rapierWorld.createCollider(wallColliderDesc);
                } else if (plane.semanticLabel === 'floor') {
                    this.raycaster.set(new Vector3(0, 2, 0), new Vector3(0, -1, 0));
                    const intersect = this.raycaster.intersectObject(plane.planeMesh)[0]
                        ?.point;
                    if (!intersect) return;
                    this.rapierWorld.removeCollider(this.floorCollider);
                    let updatedColliderDesc = this.RAPIER.ColliderDesc.cuboid(
                        10.0,
                        0,
                        10.0,
                    )
                        .setTranslation(0, intersect.y, 0)
                        .setFriction(0.5);
                    this.floorCollider =
                        this.rapierWorld.createCollider(updatedColliderDesc);
                    this.floor.position.y = intersect.y;
                    this.rigidBody.setTranslation({ x: 0, y: intersect.y + 3, z: 0 });
                }
            };
        }

        const controller = globals.controllers['right'];

        if (!controller?.targetRaySpace) {
            this.targetMarker.visible = false;
            return;
        }

        if (controller?.gamepadWrapper) {
            if (controller.gamepadWrapper.getButtonDown(XR_BUTTONS.TRIGGER)) {
                this.finalizeFurniturePosition();
            }
        }

        this.raycaster.set(
            controller.targetRaySpace.position,
            controller.targetRaySpace.getWorldDirection(new Vector3()).negate(),
        );
        const target = this.raycaster.intersectObject(this.floor, false)[0]?.point;

        if (target) {
            this.targetMarker.visible = true;
            this.targetMarker.position.copy(target);
            let position = new Vector3().copy(this.rigidBody.translation());
            let dir = new Vector3().subVectors(target, position);
            if (dir.length() < 0.01) {
                this.rigidBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
            } else {
                let velocity = dir.normalize().multiplyScalar(0.1);
                let impulse = velocity.multiplyScalar(this.rigidBody.mass());
                this.rigidBody.applyImpulse(impulse, true);
            }
        } else {
            this.targetMarker.visible = false;
        }

        const thumbstickValue = controller.gamepadWrapper.getAxis(
            AXES.XR_STANDARD.THUMBSTICK_X,
        );

        let maxRotationSpeed = -0.06;
        let torqueImpulse = new this.RAPIER.Vector3(
            0,
            thumbstickValue * maxRotationSpeed,
            0,
        );
        this.rigidBody.applyTorqueImpulse(torqueImpulse, true);

        this.rapierWorld.timestep = delta;
        this.rapierWorld.step();

        this.cube.position.copy(this.rigidBody.translation());
        this.cube.quaternion.copy(this.rigidBody.rotation());

        if (this.cube.position.y < -5) {
            this.rigidBody.setTranslation({ x: 0, y: 3, z: 0 });
        }

        if (globals.furnitureToSpawn) {
            if (!this.cube.userData.furnitureModel && !this._furnitureLoading) {
                this._furnitureLoading = true;
                this._gltfLoader.load('assets/' + globals.furnitureToSpawn, (gltf) => {
                    const model = gltf.scene.children[0];
                    model.position.y -= 0.5;
                    this.cube.add(model);
                    this.cube.userData.furnitureModel = model;
                    this._furnitureLoading = false;
                });
            }
            globals.furnitureToSpawn = null;
        }
    }

    finalizeFurniturePosition() {
        const furnitureModel = this.cube.userData.furnitureModel;
        if (furnitureModel) {
            globals.scene.attach(furnitureModel);
            furnitureModel.castShadow = true;
            this.cube.userData.furnitureModel = null;
        } else {
            return;
        }

        const translation = this.rigidBody.translation();
        const fixedRigidBodyDesc = this.RAPIER.RigidBodyDesc.fixed()
            .setTranslation(translation.x, translation.y, translation.z)
            .setRotation(this.rigidBody.rotation());
        const fixedRigidBody = this.rapierWorld.createRigidBody(fixedRigidBodyDesc);

        const colliderDesc = this.RAPIER.ColliderDesc.cuboid(
            0.5,
            0.5,
            0.5,
        ).setFriction(0.5);
        this.rapierWorld.createCollider(colliderDesc, fixedRigidBody);

        this.rigidBody.setTranslation(new this.RAPIER.Vector3(0.0, 3.0, 0.0), true);
        this.rigidBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
        this.rigidBody.setAngvel(new this.RAPIER.Vector3(0, 0, 0), true);
    }
}