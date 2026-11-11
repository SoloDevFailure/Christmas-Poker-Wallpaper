export type Point = {
    x: number;
    y: number;
};
export const W = 1920, H = 1080, SIZE = 108, QUIET = 24;
// Stored artwork stays 1920×1080. Only its presentation is inset by 5%.
export const CANVAS = {x:96,y:54,width:1728,height:972,scale:.9};
export function canvasToPresentation(p:Point):Point{return {x:CANVAS.x+p.x*CANVAS.scale,y:CANVAS.y+p.y*CANVAS.scale};}
export function presentationToCanvas(p:Point):Point{return {x:(p.x-CANVAS.x)/CANVAS.scale,y:(p.y-CANVAS.y)/CANVAS.scale};}
export const markers = [
 {id:41,x:24,y:24},{id:73,x:906,y:24},{id:105,x:1788,y:24},
 {id:137,x:24,y:486},{id:169,x:1788,y:486},
 {id:201,x:24,y:948},{id:233,x:906,y:948},{id:265,x:1788,y:948}
];
export function project(h: number[], p: Point): Point { const z = h[6] * p.x + h[7] * p.y + 1; return { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z }; }
// Least-squares eight-parameter homography, using every detected marker corner.
function solveHomography(from: Point[], to: Point[]): number[] {
    if (from.length !== to.length || from.length < 4)
        throw Error('At least four point pairs required');
    const a: number[][] = [], b: number[] = [];
    from.forEach(({ x, y }, i) => { const u = to[i].x, v = to[i].y; a.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(u, v); });
    const m = Array.from({ length: 8 }, (_, i) => Array.from({ length: 9 }, (_, j) => a.reduce((s, r, k) => s + r[i] * (j === 8 ? b[k] : r[j]), 0)));
    for (let i = 0; i < 8; i++) {
        let k = i;
        for (let j = i + 1; j < 8; j++)
            if (Math.abs(m[j][i]) > Math.abs(m[k][i]))
                k = j;
        [m[i], m[k]] = [m[k], m[i]];
        const d = m[i][i];
        if (Math.abs(d) < 1e-10)
            throw Error('Degenerate marker geometry');
        for (let j = i; j < 9; j++)
            m[i][j] /= d;
        for (let r = 0; r < 8; r++)
            if (r !== i) {
                const f = m[r][i];
                for (let j = i; j < 9; j++)
                    m[r][j] -= f * m[i][j];
            }
    }
    return m.map(r => r[8]);
}
function multiply(a: number[], b: number[]) {
    return Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((s, k) => s + a[Math.floor(i / 3) * 3 + k] * b[k * 3 + i % 3], 0));
}
function normalized(points: Point[]) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const distance = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length;
    if (!Number.isFinite(distance) || distance < 1e-8)
        throw Error('Degenerate marker geometry');
    const s = Math.SQRT2 / distance;
    return { points: points.map(p => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })), matrix: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1], inverse: [1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1] };
}
// Normalized least squares avoids losing precision on large/oblique coordinates.
export function homography(from: Point[], to: Point[]) {
    if (from.length !== to.length || from.length < 4)
        throw Error('At least four point pairs required');
    const a = normalized(from), b = normalized(to);
    const h = multiply(b.inverse, multiply([...solveHomography(a.points, b.points), 1], a.matrix));
    if (!Number.isFinite(h[8]) || Math.abs(h[8]) < 1e-12)
        throw Error('Degenerate perspective');
    return h.slice(0, 8).map(v => v / h[8]);
}
export function invertHomography(h: number[]) {
    const [a, b, c, d, e, f, g, k] = h;
    const m = [e - f * k, c * k - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * k - e * g, b * g - a * k, a * e - b * d];
    if (Math.abs(m[8]) < 1e-12)
        throw Error('Singular perspective');
    return m.slice(0, 8).map(v => v / m[8]);
}
export type Detection = {
    id: number;
    corners: Point[];
};
export type MarkerDiagnostic=Detection & {status:'accepted'|'rejected'|'pending';reason:string;residual?:number};
export type FitDiagnostics={markers:MarkerDiagnostic[];candidateIds:number[];check:string};
export const MAX_REPROJECTION_ERROR = 4;
export function markerCorners(m: typeof markers[number]): Point[] {
    return [{ x: m.x, y: m.y }, { x: m.x + SIZE, y: m.y }, { x: m.x + SIZE, y: m.y + SIZE }, { x: m.x, y: m.y + SIZE }].map(presentationToCanvas);
}
function soundQuad(points: Point[]) {
    if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        return false;
    const cross = points.map((p, i) => { const q = points[(i + 1) % 4], r = points[(i + 2) % 4]; return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x); });
    return cross.every(v => v > 0) && points.every((p, i) => Math.hypot(p.x - points[(i + 1) % 4].x, p.y - points[(i + 1) % 4].y) >= 12);
}
export type TrackingRejection='insufficient-markers'|'invalid-marker-geometry'|'poor-homography'|'invalid-projection';
export class TrackingError extends Error {
 constructor(public reason:TrackingRejection,message:string,public detected:number,public usable:number){super(message);this.name='TrackingError';}
}
// Corner covariance measures the actual 2D footprint, including each tag's extent.
// Three tags on one screen edge are not collinear point observations.
export function usableGeometry(points:Point[]) {
 const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;
 let xx=0,xy=0,yy=0;for(const p of points){xx+=(p.x-cx)**2;xy+=(p.x-cx)*(p.y-cy);yy+=(p.y-cy)**2;}
 const trace=xx+yy;return Number.isFinite(trace)&&trace>0&&(xx*yy-xy*xy)/(trace*trace)>1e-4;
}
export function fitMarkers(found: Detection[],frame?:{width:number;height:number;aim?:Point},trace?:FitDiagnostics) {
    const detected=markers.filter(m=>found.some(f=>f.id===m.id)).length;
    const tolerance=MAX_REPROJECTION_ERROR*(frame?Math.max(frame.width,frame.height)/1280:1);
    if(trace){trace.candidateIds=[];trace.check='';trace.markers=found.map(f=>{
        let reason='';
        if(!markers.some(m=>m.id===f.id))reason='Unknown marker ID';
        else if(found.filter(v=>v.id===f.id).length!==1)reason='Duplicate marker ID (ambiguous)';
        else if(!soundQuad(f.corners)){
            if(f.corners.length!==4)reason='Incomplete marker: four corners required';
            else if(f.corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))reason='Non-finite corner coordinates';
            else {const crosses=f.corners.map((p,i)=>{const q=f.corners[(i+1)%4],r=f.corners[(i+2)%4];return(q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});reason=crosses.some(v=>v<=0)?'Non-convex or reversed corner geometry':'Marker edge below 12 px';}
        }
        return {...f,status:reason?'rejected':'pending',reason:reason||'Awaiting homography validation'};
    });}
    const visible = markers.flatMap(m => {
        const matches = found.filter(f => f.id === m.id);
        // Duplicate IDs are ambiguous, even when one candidate looks plausible.
        // An ambiguous ID is discarded; three other complete markers can still track.
        return matches.length === 1 && soundQuad(matches[0].corners) ? [{ marker: m, camera: matches[0].corners }] : [];
    });
    if (visible.length < 3){
        if(trace){trace.check=detected<3?'Fewer than 3 known marker IDs':'Fewer than 3 usable complete markers';trace.markers.forEach(m=>{if(m.status==='pending'){m.status='rejected';m.reason=trace.check;}});}
        throw new TrackingError(detected<3?'insufficient-markers':'invalid-marker-geometry',detected<3?'Show at least 3 markers':'Detected tags are too small, malformed or ambiguous',detected,visible.length);
    }
    type Group = typeof visible;
    const fit = (group: Group) => {
        const board = group.flatMap(v => markerCorners(v.marker)), camera = group.flatMap(v => v.camera);
        const inverse = homography(board, camera), h = invertHomography(inverse);
        const distances = (v: Group[number]) => markerCorners(v.marker).map((p, i) => { const q = project(inverse, p); return Math.hypot(q.x - v.camera[i].x, q.y - v.camera[i].y); });
        const residual = (v: Group[number]) => Math.max(...distances(v));
        const rms = (v: Group[number]) => Math.sqrt(distances(v).reduce((s, d) => s + d * d, 0) / 4);
        return { h, inverse, residual, rms };
    };
    let candidate:{model:ReturnType<typeof fit>;ids:number[];cost:number;check:string}|undefined;
    // Observational only: never used by model selection or acceptance checks.
    function note(model:ReturnType<typeof fit>,check:string){
        if(!trace)return;
        const errors=visible.map(v=>model.residual(v)),ids=visible.filter((_,i)=>errors[i]<=tolerance).map(v=>v.marker.id);
        const cost=errors.slice().sort((a,b)=>a-b).slice(0,3).reduce((s,v)=>s+v,0);
        if(!candidate||ids.length>candidate.ids.length||ids.length===candidate.ids.length&&cost<candidate.cost)candidate={model,ids,cost,check};
    }
    // Exhaustive marker-level consensus, with an all-marker fast path.
    const hypotheses:Group[]=[visible];
    for(let a=0;a<visible.length-2;a++)for(let b=a+1;b<visible.length-1;b++)for(let c=b+1;c<visible.length;c++)hypotheses.push([visible[a],visible[b],visible[c]]);
    let best: ReturnType<typeof fit> & {
        error: number;
        ids: number[];
    } | null = null;
    let projectionRejected=false,geometryRejected=false;
    for (const sample of hypotheses)
        try {
            let model = fit(sample);
            let inliers = visible.filter(v => model.residual(v) <= tolerance);
            if(inliers.length<3){note(model,'Fewer than 3 tags within the corner reprojection limit');continue;}
            if(!usableGeometry(inliers.flatMap(v=>markerCorners(v.marker)))||!usableGeometry(inliers.flatMap(v=>v.camera))){geometryRejected=true;note(model,'Degenerate marker corner footprint');continue;}
            model = fit(inliers);
            // Refitting a consensus can push one marginal tag outside the bound.
            // Trim that genuine outlier and refit instead of discarding the solution.
            while(inliers.length>3&&inliers.some(v=>model.residual(v)>tolerance)){
                const worst=inliers.reduce((a,b)=>model.residual(a)>model.residual(b)?a:b);
                inliers=inliers.filter(v=>v!==worst);model=fit(inliers);
            }
            if(!usableGeometry(inliers.flatMap(v=>markerCorners(v.marker)))||!usableGeometry(inliers.flatMap(v=>v.camera))){note(model,'Degenerate corner footprint after refit');continue;}
            const errors = inliers.map(v => model.rms(v));
            if (inliers.some(v => model.residual(v) > tolerance)){note(model,'Corner reprojection error above limit after refit');continue;}
            if (errors.some(e => !Number.isFinite(e) || e > tolerance)){note(model,'Non-finite or excessive homography reprojection error');continue;}
            // Validate the observed footprint and local aiming point. Unseen parts
            // of a plane may cross the camera horizon during a legitimate close-up.
            const board=inliers.flatMap(v=>markerCorners(v.marker));
            const denominators=board.map(p=>model.inverse[6]*p.x+model.inverse[7]*p.y+1);
            const sign=Math.sign(denominators[0]);
            if(!denominators.every(v=>Number.isFinite(v)&&v*sign>1e-6)){note(model,'Homography horizon crosses observed markers');continue;}
            if(frame){
                const aim=frame.aim||{x:frame.width/2,y:frame.height/2};
                const radius=Math.max(4,Math.min(frame.width,frame.height)*.015);
                const local=[{x:aim.x-radius,y:aim.y-radius},{x:aim.x+radius,y:aim.y-radius},{x:aim.x+radius,y:aim.y+radius},{x:aim.x-radius,y:aim.y+radius}];
                const z=local.map(p=>model.h[6]*p.x+model.h[7]*p.y+1);
                const points=local.map(p=>project(model.h,p));
                // Local orientation/convexity, finite coordinates, no horizon near aim.
                if(!z.every(v=>Number.isFinite(v)&&v*z[0]>0)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) {projectionRejected=true;note(model,'Aim crosses the homography horizon or is non-finite');continue;}
                const crosses=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
                if(!crosses.every(v=>v>0)){projectionRejected=true;note(model,'Aim projection flips or collapses');continue;}
                // A tag-only fit must also predict the aim consistently when any
                // one tag is omitted. This catches unsafe extrapolation from a
                // thin close-up footprint without requiring distant screen corners.
                const centre=project(model.h,aim);
                const worldPixel= Math.max(...points.map(p=>Math.hypot(p.x-centre.x,p.y-centre.y)))/(radius*Math.SQRT2);
                const limit=Math.max(6,2*tolerance)*worldPixel;
                if(inliers.some((_,i)=>{try{const leave=fit(inliers.filter((_,j)=>i!==j)),q=project(leave.h,aim);return Math.hypot(q.x-centre.x,q.y-centre.y)>limit;}catch{return true;}})){projectionRejected=true;note(model,'Leave-one-tag-out aim consistency check failed');continue;}
            }
            const error = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length), ids = inliers.map(v => v.marker.id);
            if (!best || ids.length > best.ids.length || ids.length === best.ids.length && error < best.error)
                best = { ...model, error, ids };
            if(ids.length===visible.length)break;
        }
        catch(e) { if(trace&&!candidate)trace.check='Invalid homography: '+(e instanceof Error?e.message:String(e)); /* Ignore ill-conditioned hypotheses, never invent a fourth corner. */ }
    if(trace){
        const reference=best||candidate?.model;
        trace.candidateIds=best?.ids||candidate?.ids||[];
        trace.check=best?'':candidate?.check||trace.check||'No valid homography';
        for(const marker of trace.markers){
            if(marker.status==='rejected')continue;
            const v=visible.find(v=>v.marker.id===marker.id);
            if(reference&&v)marker.residual=reference.residual(v);
            if(best?.ids.includes(marker.id)){marker.status='accepted';marker.reason='Used by accepted homography';}
            else if(best){marker.status='rejected';marker.reason=marker.residual!==undefined&&marker.residual>tolerance?'Corner error '+marker.residual.toFixed(2)+' px > '+tolerance.toFixed(2)+' px':'Excluded by robust consensus';}
            else if(candidate&&candidate.ids.length<3&&candidate.ids.includes(marker.id)){marker.status='pending';marker.reason='Candidate only: fewer than 3 consistent tags';}
            else {marker.status='rejected';marker.reason=marker.residual!==undefined&&marker.residual>tolerance?'Candidate corner error '+marker.residual.toFixed(2)+' px > '+tolerance.toFixed(2)+' px':'Frame rejected: '+trace.check;}
        }
    }
    if (!best)
        throw new TrackingError(projectionRejected?'invalid-projection':geometryRejected?'invalid-marker-geometry':'poor-homography',projectionRejected?'Aim is outside reliable marker geometry':geometryRejected?'Show markers with more visible corner area':'Marker corners do not agree on a perspective',detected,visible.length);
    return { h: best.h, inverse: best.inverse, error: best.error, ids: best.ids, count: best.ids.length, usable:visible.length,detected,tolerance,confidence: best.ids.length >= 4 && best.error < tolerance/2 ? 'high' : 'good' };
}
