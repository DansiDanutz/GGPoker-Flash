import * as THREE from 'three';
import { bendCardPoint, CARD_WIDTH as W, CARD_HEIGHT as H, squeezePose } from './squeezeSurface';
export type SqueezeRenderer = {
    paint: (frame: number) => void;
    dispose: () => void;
};
/** Two thin sheets share the same bend; textures stay attached to material coordinates. */
export async function createSqueeze3D(canvas: HTMLCanvasElement, ordinals: number[], onLost: () => void): Promise<SqueezeRenderer> {
    if (ordinals.length !== 2 || ordinals.some(n => !Number.isInteger(n) || n < 0 || n > 51))
        throw new Error('Invalid squeeze cards');
    const load = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); return image; };
    const [back, atlas] = await Promise.all([load('/assets/cards/back_green.png'), load('/assets/cards/faces_classic.png')]);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.debug.onShaderError = () => { throw new Error('Card squeeze shader compilation failed'); };
    renderer.setPixelRatio(1); // The existing 652×484 surface already exceeds its phone CSS size.
    renderer.setSize(652, 484, false);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-196, 196, 145.5, -145.5, 1, 1500);
    camera.position.set(0, -400, 300);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 14);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x748578, 2));
    const light = new THREE.DirectionalLight(0xfff6df, 2.4);
    light.position.set(-160, -120, 330);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 1, far: 700 });
    light.shadow.bias = -.0003;
    light.shadow.normalBias = .2;
    scene.add(light);
    const groundGeometry = new THREE.PlaneGeometry(700, 700);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: .22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.z = -.7;
    ground.receiveShadow = true;
    scene.add(ground);
    const resources: Array<{
        dispose: () => void;
    }> = [groundGeometry, groundMaterial];
    let disposed = false;
    const lost = (e: Event) => { e.preventDefault(); if (!disposed)
        onLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        canvas.removeEventListener('webglcontextlost', lost);
        for (const resource of resources)
            resource.dispose();
        light.shadow.map?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
    };
    try {
        const texture = (ordinal: number | null) => {
            const sheet = document.createElement('canvas');
            sheet.width = 216;
            sheet.height = 304;
            const ctx = sheet.getContext('2d')!;
            if (ordinal === null)
                ctx.drawImage(back, 0, 0, 216, 304);
            else {
                ctx.translate(0, 304);
                ctx.scale(1, -1);
                ctx.fillStyle = '#fffefa';
                ctx.fillRect(0, 0, 216, 304);
                const x = Math.floor(ordinal / 4) * 122 + 7, y = (ordinal % 4) * 162 + 5;
                // Reuse the original index and centre art at playing-card proportions for this close-up.
                ctx.drawImage(atlas, x, y, 37, 73, 8, 8, 42, 83);
                ctx.drawImage(atlas, x + 40, y + 45, 62, 100, 78, 92, 124, 200);
            }
            const map = new THREE.CanvasTexture(sheet);
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            resources.push(map);
            return map;
        };
        const backMap = texture(null);
        const cards = ordinals.map((_, card) => {
            const ordinal = ordinals[1 - card];
            const geometry = new THREE.PlaneGeometry(W, H, 32, 48);
            const uv = geometry.attributes.uv;
            // Round the material boundary before deformation, preserving the rounded corners.
            const source = Array.from({ length: uv.count }, (_, i) => {
                let x = uv.getX(i) * W, y = (1 - uv.getY(i)) * H;
                const r = 8, cx = Math.max(r, Math.min(W - r, x)), cy = Math.max(r, Math.min(H - r, y));
                const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
                if (d > r) {
                    x = cx + dx * r / d;
                    y = cy + dy * r / d;
                }
                uv.setXY(i, x / W, 1 - y / H);
                return { x, y };
            });
            (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
            const backMaterial = new THREE.MeshStandardMaterial({ map: backMap, side: THREE.FrontSide, roughness: .65, metalness: 0 });
            const faceMaterial = new THREE.MeshStandardMaterial({ map: texture(ordinal), side: THREE.BackSide, roughness: .65, metalness: 0 });
            const frontGeometry = geometry.clone();
            const perimeter = [...Array.from({ length: 33 }, (_, i) => i), ...Array.from({ length: 48 }, (_, i) => (i + 1) * 33 + 32), ...Array.from({ length: 32 }, (_, i) => 48 * 33 + 31 - i), ...Array.from({ length: 47 }, (_, i) => (47 - i) * 33)];
            const rimGeometry = new THREE.BufferGeometry();
            rimGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(perimeter.length * 6), 3));
            const indices = perimeter.flatMap((_, i) => { const j = (i + 1) % perimeter.length; return [i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1]; });
            rimGeometry.setIndex(indices);
            const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xe3decf, roughness: .8, side: THREE.DoubleSide });
            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            const top = new THREE.Mesh(geometry, backMaterial), face = new THREE.Mesh(frontGeometry, faceMaterial);
            const group = new THREE.Group();
            group.rotation.z = 25 * Math.PI / 180;
            for (const mesh of [top, face, rim]) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.frustumCulled = false;
                group.add(mesh);
            }
            scene.add(group);
            resources.push(geometry, frontGeometry, rimGeometry, rimMaterial, backMaterial, faceMaterial);
            return { geometry, frontGeometry, rimGeometry, perimeter, source, group, card };
        });
        const paint = (frame: number) => {
            if (disposed)
                return;
            const pose = squeezePose(frame);
            for (const { geometry, frontGeometry, rimGeometry, perimeter, source, group, card } of cards) {
                for (const [sheet, side] of [[geometry, 1], [frontGeometry, -1]] as const) {
                    const positions = sheet.attributes.position;
                    for (let i = 0; i < source.length; i++) {
                        const p = bendCardPoint(source[i].x, source[i].y, pose.pressure, card * .55 + side * .12);
                        positions.setXYZ(i, p.x - W / 2, -p.y + H / 2, p.z);
                    }
                    positions.needsUpdate = true;
                    sheet.computeVertexNormals();
                }
                const rim = rimGeometry.attributes.position;
                perimeter.forEach((index, j) => { for (const [sheet, side] of [[geometry, 0], [frontGeometry, 1]] as const) {
                    const p = sheet.attributes.position;
                    rim.setXYZ(j * 2 + side, p.getX(index), p.getY(index), p.getZ(index));
                } });
                rim.needsUpdate = true;
                rimGeometry.computeVertexNormals();
                group.position.x = (.5 - card) * 32 * pose.spread;
            }
            renderer.render(scene, camera);
        };
        paint(0);
        return { paint, dispose };
    }
    catch (error) {
        dispose();
        throw error;
    }
}
