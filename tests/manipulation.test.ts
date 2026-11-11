import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homography, project, W, H } from '../src/geometry.ts';
import { videoViewport, viewToImage, imageToView, manipulate, trackingPhase, stickerCorners, cameraPoint, onVideo } from '../src/manipulation.ts';
const p = { stamp_type: 'star' as const, position_x: .5, position_y: .5, scale: 160, rotation: 35 };
function close(a: number, b: number) { assert.ok(Math.abs(a - b) < 1e-6, a + ' vs ' + b); }
for (const [width, height] of [[390, 844], [844, 390], [1024, 768]])
    for (const fit of ['contain', 'cover'] as const)
        test('camera/view round trip ' + width + 'x' + height + ' ' + fit, () => {
            const v = videoViewport(width, height, 1280, 720, fit);
            for (const image of [{ x: 0, y: 0 }, { x: 640, y: 360 }, { x: 1279, y: 719 }]) {
                const q = viewToImage(imageToView(image, v), v);
                close(q.x, image.x);
                close(q.y, image.y);
            }
            close(imageToView({ x: 640, y: 360 }, v).x, width / 2);
            close(imageToView({ x: 640, y: 360 }, v).y, height / 2);
            if (fit === 'contain' && height > width)
                assert.equal(onVideo({ x: width / 2, y: 0 }, v), false);
        });
test('one finger translates while preserving size, rotation and grab offset', () => {
    const q = manipulate({ placement: p, points: [{ x: 1000, y: 560 }] }, [{ x: 1100, y: 610 }]);
    close(q.position_x * W, 1060);
    close(q.position_y * H, 590);
    close(q.scale, 160);
    close(q.rotation, 35);
});
test('two fingers scale and rotate around their centroid, including translation', () => {
    const q = manipulate({ placement: p, points: [{ x: 860, y: 540 }, { x: 1060, y: 540 }] }, [{ x: 1060, y: 390 }, { x: 1060, y: 790 }]);
    close(q.position_x * W, 1060);
    close(q.position_y * H, 590);
    close(q.scale, 320);
    close(q.rotation, 125);
    const around = manipulate({ placement: { ...p, position_x: 1060 / W }, points: [{ x: 860, y: 540 }, { x: 1060, y: 540 }] }, [{ x: 960, y: 340 }, { x: 960, y: 740 }]);
    close(around.position_x * W, 960);
    close(around.position_y * H, 740);
});
test('rebasing on finger transitions does not jump and limits size safely', () => {
    const one = manipulate({ placement: p, points: [{ x: 960, y: 540 }] }, [{ x: 1000, y: 600 }]);
    const points = [{ x: 1000, y: 600 }, { x: 1200, y: 600 }], two = manipulate({ placement: one, points }, points);
    assert.deepEqual(two, one);
    assert.deepEqual(manipulate({ placement: two, points: [points[0]] }, [points[0]]), one);
    assert.equal(manipulate({ placement: p, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]).scale, 600);
});
test('orientation and camera motion preserve anchored wallpaper coordinates', () => {
    const board = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], camera = [{ x: 120, y: 50 }, { x: 1150, y: 100 }, { x: 1050, y: 640 }, { x: 180, y: 690 }];
    const forward = homography(board, camera), inverse = homography(camera, board);
    for (const [width, height] of [[390, 844], [844, 390]]) {
        const v = videoViewport(width, height, 1280, 720), screen = imageToView(project(forward, { x: p.position_x * W, y: p.position_y * H }), v), world = cameraPoint(inverse, screen, v);
        close(world.x, p.position_x * W);
        close(world.y, p.position_y * H);
    }
    const corners = stickerCorners(p);
    close(Math.hypot(corners[0].x - corners[1].x, corners[0].y - corners[1].y), p.scale);
});
test('brief dropouts may hold the picture, never imply a stampable fresh pose', () => {
    assert.equal(trackingPhase(100, 200, true), 'locked');
    assert.equal(trackingPhase(100, 200, false), 'holding');
    assert.equal(trackingPhase(100, 400, false), 'lost');
    assert.equal(trackingPhase(100, 500, true), 'lost');
});
