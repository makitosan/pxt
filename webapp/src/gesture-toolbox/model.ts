import * as Recorder from './recorder';
import * as Algorithms from './algorithms';
import { Vector, Match } from './types';
import * as pkg from "./../package";

export class SingleDTWCore {
    private dtw: Algorithms.SpringAlgorithm<Vector>;
    private dba: Algorithms.DBA<Vector>;
    private classNumber: number;

    public refPrototype: Vector[];
    public threshold: number;
    public avgLength: number;


    constructor(classNum: number) {
        this.classNumber = classNum;
        this.dba = new Algorithms.DBA<Vector>(Algorithms.EuclideanDistanceFast, Algorithms.Average);
        // call update to generate the referencePrototype and threshold
        // this.Update(initialData);
        // this.dtw = new Algorithms.SpringAlgorithm<Vector>(this.refPrototype, this.threshold, this.classNumber, this.avgLength, Algorithms.EuclideanDistanceFast);
    }


    public Update(data: Vector[][]) {
        // split data
        let trainData: Vector[][] = [];
        let thresholdData: Vector[][] = [];
        let lengthSum = 0;

        for (let i = 0; i < data.length; i++) {
            if (i % 2 == 0) trainData.push(data[i]);
            else thresholdData.push(data[i]);

            lengthSum += data.length;
        }

        this.avgLength = Math.round(lengthSum / data.length);

        this.refPrototype = Algorithms.roundVecArray(this.dba.computeKMeans(trainData, 1, 10, 10, 0.01)[0].mean);
        this.threshold = Math.round(Algorithms.findMinimumThreshold(thresholdData, this.refPrototype, this.avgLength, Algorithms.EuclideanDistanceFast, 0.1, 5));

        // update the Spring algorithm
        // reset the Spring algorithm
        this.dtw = new Algorithms.SpringAlgorithm<Vector>(this.refPrototype, this.threshold, this.classNumber, this.avgLength, Algorithms.EuclideanDistanceFast);
    }


    public Feed(xt: Vector): Match {
        return this.dtw.Feed(xt);
    }


    public GenerateBlock() {
        let gestureTS = `
/**
 * Gesture blocks
 */
//% weight=100 color=#d3a226 icon=""
namespace custom {
    let MY_EVENT_SRC: number = 873;
    let is_initialized: boolean = false;

    //% blockId=something_descriptive block="on gesture"
    export function onGesture(a: () => void) {
        if (!is_initialized)
            initialize_predictor();

        control.onEvent(MY_EVENT_SRC, 1, a);
    }

    function initialize_predictor() {
        is_initialized = true;

        control.runInBackground(() => {
            let threshold = ${this.threshold};
            let avgLength = ${this.avgLength};

            let infinityPrototype = ${this.vecArrayToString(this.refPrototype)};

            let spring = new SpringAlgorithm(infinityPrototype, threshold, avgLength, EuclideanDistanceFast);

            while (true) {
                let x = input.acceleration(Dimension.X);
                let y = input.acceleration(Dimension.Y);
                let z = input.acceleration(Dimension.Z);

                if (spring.Feed(new Vector(x, y, z)) == 1)
                    control.raiseEvent(MY_EVENT_SRC, 1);

                loops.pause(40);    //almost 25fps
            }
        });
    }
}

function EuclideanDistanceFast(a: Vector, b: Vector): number {
    // L2 Norm:
    return IntegerSqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y) + (a.Z - b.Z) * (a.Z - b.Z));
}

function IntegerSqrt(n: number) {
    if (n < 0) return -1;

    let shift = 2;
    let nShifted = n >> shift;

    while (nShifted != 0 && nShifted != n) {
        shift += 2;
        nShifted = n >> shift;
    }

    shift -= 2;

    let result = 0;

    while (shift >= 0) {
        result = result << 1;
        let candidateResult = result + 1;

        if (candidateResult * candidateResult <= n >> shift)
            result = candidateResult;

        shift -= 2;
    }

    return result;
}

class Vector {
    public X: number;
    public Y: number;
    public Z: number;

    constructor(x: number, y: number, z: number) {
        this.X = x;
        this.Y = y;
        this.Z = z;
    }
}

class SpringAlgorithm {
    private distFunction: (a: Vector, b: Vector) => number;

    private Y: Vector[];
    private eps: number;
    private M: number;

    private minLen: number;
    private maxLen: number;

    private s: number[];
    private d: number[];
    private s2: number[];
    private d2: number[];
    
    private dmin: number;

    private t: number;
    private te: number;
    private ts: number;

    private report: (dmin: number, ts: number, te: number) => void;


    constructor(_input: Vector[], _epsilon: number, avgLen: number, _distFun: (a: Vector, b: Vector) => number) {
        this.Y = _input;
        this.eps = _epsilon;
        this.distFunction = _distFun;

        this.M = _input.length;

        this.minLen = Math.idiv(Math.imul(avgLen, 7), 10);
        this.maxLen = Math.idiv(Math.imul(avgLen, 13), 10);

        this.d = [];
        this.s = [];
        this.d2 = [];
        this.s2 = [];

        for (let i = 0; i < this.M + 1; i++) {
            this.d.push(0);
            this.s.push(0);
            this.d2.push(0);
            this.s2.push(0);
        }

        for (let i = 1; i <= this.M; i++) {
            this.d[i] = 1e8;
            this.s[i] = 0;
        }

        this.dmin = 1e8;
        this.t = 0;
        this.ts = 0;
        this.te = 0;
    }


    public Feed(xt: Vector) {
        let predicted = 0;

        let t = this.t + 1;
        let d: number[] = this.d2;
        let s: number[] = this.s2;

        d[0] = 0;
        s[0] = t;

        // update M distances (d[] based on dp[]) and M starting points (s[] based on sp[]):
        for (let i = 1; i <= this.M; i++) {
            let dist = this.distFunction(this.Y[i - 1], xt);
            let di_minus1 = d[i - 1];
            let dip = this.d[i];
            let dip_minus1 = this.d[i - 1];

            // compute dbest and use that to compute s[i]
            if (di_minus1 <= dip && di_minus1 <= dip_minus1) {
                d[i] = dist + di_minus1;
                s[i] = s[i - 1];
            } else if (dip <= di_minus1 && dip <= dip_minus1) {
                d[i] = dist + dip;
                s[i] = this.s[i];
            } else {
                d[i] = dist + dip_minus1;
                s[i] = this.s[i - 1];
            }
        }

        if (this.dmin <= this.eps) {
            let matchLength = this.te - this.ts;

            if (matchLength > this.minLen && matchLength < this.maxLen) {
                let condition = true;

                for (let i = 0; i <= this.M; i++)
                    if (!(d[i] >= this.dmin || s[i] > this.te))
                        condition = false;

                if (condition) {
                    predicted = 1;
                    this.dmin = 1e8;

                    for (let i = 1; i <= this.M; i++) {
                        if (s[i] <= this.te) {
                            d[i] = 1e8;
                        }
                    }
                }
            }
        }

        if (d[this.M] <= this.eps && d[this.M] < this.dmin) {
            this.dmin = d[this.M];
            this.ts = s[this.M];
            this.te = t;
        }

        this.d2 = this.d; this.d = d;
        this.s2 = this.s; this.s = s;
        this.t = t;

        return predicted;
    }
}
`;

        pkg.mainEditorPkg().setFile("custom.ts", gestureTS);
    }


    private vecArrayToString(vec: Vector[]): string {
        let vecStr = "[";

        for (let i = 0; i < vec.length; i++) {
            vecStr += "new Vector(" + vec[i].X + ", " + vec[i].Y + ", " + vec[i].Z + ")";
            if (i != vec.length - 1) vecStr += ",\n";
        }

        vecStr += "]";

        return vecStr;
    }
}

export let core = new SingleDTWCore(1);