import { getDistance } from "geolib";
import { Buffer } from "./buffer.js";
import { DistanceCalculator, POIWithDistance, RouteWithDistance, StopWithDistance } from "./distanceCalculator.js";
import { TransitPOI, isRoute } from "./routeMap.js";

export class LocationAnalyzer {
    protected status: Status = { guesses: [], nearbyPlatforms: [] };
    protected readonly bufferLimit = 10;
    protected readonly history = new Buffer<ResultStatus>(this.bufferLimit);
    protected readonly distanceCalculator = new DistanceCalculator();

    public constructor(
        pois: TransitPOI[] = [],
    ) {
        this.updatePOIs(pois);
    }

    public updatePosition(location: GeoPosition): void {
        this.status = this.calculateStatus(location);
    }

    public getStatus(): Status {
        return this.status;
    }

    protected calculateStatus(location: GeoPosition): Status {
        const rightDirectionPois = this.distanceCalculator
            .getUniquePOIsNear(location)
            .filter(this.directionFilter(location));
        const nearbyPlatforms = rightDirectionPois
            .filter(isStopDistance)
            .sort(byProximity);
        const closePoints = rightDirectionPois
            .filter(isCloserThan(location.accuracy))
            .sort(byProximity);

        const last = this.history[this.history.length - 1];
        const reSeenPoints = rightDirectionPois.filter(poi => last?.guesses.find(lastGuess => lastGuess.poi.id === poi.poi.id));

        let guesses = closePoints;
        if (reSeenPoints.length > 0) {
            guesses = reSeenPoints;
        }

        const status = {
            location,
            guesses,
            nearbyPlatforms
        };
        this.updateStatusHistory(status);
        return status;
    }

    protected directionFilter(currentLocation: GeoPosition): (poi: POIWithDistance) => boolean {
        if (!isResultStatus(this.status)) return () => true;
        return new MatchingDirectionFilter(
            [...this.history.map(status => status.location), currentLocation],
            this.distanceCalculator.getUniquePOIsNear(this.status.location)
        ).asFunction();
    }

    protected keepClosestOfEachPoi(pois: POIWithDistance[]): POIWithDistance[] {
        const closestOfEachPoi = new Map<string, POIWithDistance>();
        pois.forEach(poi => {
            const currentClosest = closestOfEachPoi.get(poi.poi.id);
            if (currentClosest === undefined
                || poi.distance.value < currentClosest.distance.value) {
                closestOfEachPoi.set(poi.poi.id, poi);
            }
        });
        return Array.from(closestOfEachPoi.values());
    }

    protected updateStatusHistory(status: ResultStatus): void {
        this.history.push(status);
    }

    public updatePOIs(pois: TransitPOI[]): void {
        this.distanceCalculator.updatePOIs(pois);
        if (!isResultStatus(this.status)) return;
        this.status = this.calculateStatus(this.status.location);
    }
}

class MatchingDirectionFilter {
    protected readonly currentLocation: GeoPosition | undefined;
    protected readonly lastLocation: GeoPosition | undefined;

    public constructor(
        protected readonly locationHistory: GeoPosition[],
        protected readonly lastPoisWithDistance: POIWithDistance[]
    ) {
        this.currentLocation = locationHistory[locationHistory.length - 1];
        this.lastLocation = locationHistory[locationHistory.length - 2];
    }

    public asFunction(): (poi: POIWithDistance) => boolean {
        return this.apply.bind(this);
    }

    protected apply(poi: POIWithDistance): boolean {
        if (isStopDistance(poi)) return true;
        if (this.currentLocation === undefined) return true;
        if (this.lastLocation === undefined) return true;

        const lastPoi = this.lastPoisWithDistance
            .find(lastPoi => lastPoi.poi.id === poi.poi.id) as RouteWithDistance | undefined;
        if (lastPoi === undefined) return true;

        const atSameSection = poi.distance.section === lastPoi.distance.section;
        if (atSameSection) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const sectionEnd = poi.poi.sections[poi.distance.consecutiveSection]![poi.distance.section + 1]!;
            const lastDistanceToSectionEnd = getDistance(this.lastLocation, sectionEnd);
            const currentDistanceToSectionEnd = getDistance(this.currentLocation, sectionEnd);
            return currentDistanceToSectionEnd <= lastDistanceToSectionEnd;
        }

        return poi.distance.section > lastPoi.distance.section;
    }
}

function byProximity(a: POIWithDistance, b: POIWithDistance): number {
    return a.distance.value - b.distance.value;
}

function isCloserThan(maxDistance: number): (poi: POIWithDistance) => boolean {
    return poi => poi.distance.value <= maxDistance;
}

export function isRouteDistance(poi: POIWithDistance): poi is RouteWithDistance {
    return isRoute(poi.poi);
}

export function isStopDistance(poi: POIWithDistance): poi is StopWithDistance {
    return !isRoute(poi.poi);
}

export function isResultStatus(status: Status): status is ResultStatus {
    return Object.hasOwn(status, "location");
}

export type Status = NoResultStatus | ResultStatus;

export type NoResultStatus = Omit<ResultStatus, "location">;

export interface ResultStatus {
    location: GeoPosition;
    guesses: POIWithDistance[];
    nearbyPlatforms: StopWithDistance[];
}

export interface Stop {
    id: string;
    name: string;
    boundaries: GeoLocation[];
}

export interface GeoPosition extends GeoLocation {
    accuracy: number;
}

export interface GeoLocation {
    latitude: number;
    longitude: number;
    altitude?: number;
}

export interface Route {
    id: string;
    from: string;
    to: string;
    ref: string;
    sections: Section[][];
}

export interface Section {
    routeId: string;
    consecutiveSection: number;
    sequence: number;
    lat: number;
    lon: number;
}
