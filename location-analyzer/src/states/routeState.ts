import { Buffer } from "../buffer.js";
import { DistanceCalculator, POIWithDistance, RouteWithDistance, StopWithDistance } from "../distanceCalculator.js";
import { FilledState, GeoPosition, ResultStatus, StopState, UnknownState, isGuessFor, isRouteDistance, isStopDistance } from "./states.js";

interface RouteWithAveragedDistance {
    guess: RouteWithDistance;
    averagedDistance: number;
}

export class RouteState extends FilledState implements ResultStatus {
    public constructor(
        fullHistory: Buffer<POIWithDistance[]>,
        history: Buffer<ResultStatus>,
        distanceCalculator: DistanceCalculator,
        location: GeoPosition,
        public readonly guesses: RouteWithDistance[],
        protected readonly possibilities: RouteWithDistance[],
        nearbyPlatforms: StopWithDistance[]
    ) {
        super(fullHistory, history, distanceCalculator, location, guesses, nearbyPlatforms);
    }

    public getNext(location: GeoPosition): FilledState {
        const closestPois = this.distanceCalculator.getUniquePOIsNear(location);
        this.fullHistory.append(closestPois);

        const possibilityIds = this.possibilities.map(possibility => possibility.poi.id);
        const rightDirectionRoutes = closestPois
            .filter(isRouteDistance)
            .filter(this.directionFilter(location))
            .filter(poi => possibilityIds.includes(poi.poi.id));
        let closest = this.getClosestRoutesByCumulatedDistance(rightDirectionRoutes);

        if (location.speed < this.onRouteSpeedCutoff) {
            closest = closest.filter(route => route.averagedDistance < (location.accuracy * 2));
        }

        if (closest.length !== 0) {
            return new RouteState(
                this.fullHistory,
                this.history,
                this.distanceCalculator,
                location,
                closest.map(route => route.guess),
                this.possibilities,
                this.nearbyPlatforms
            );
        }

        const rightDirectionPois = closestPois.filter(this.directionFilter(location));
        const closestByCumulation = this.getClosestByAveragedDistance(rightDirectionPois).map(guess => guess.guess);
        const stopsInClosest = closestByCumulation.filter(isStopDistance);
        if (stopsInClosest.length > 0) {
            return new StopState(
                this.fullHistory,
                this.history,
                this.distanceCalculator,
                location,
                stopsInClosest,
                this.nearbyPlatforms
            );
        }

        return new UnknownState(
            this.fullHistory,
            this.history,
            this.distanceCalculator,
            location,
            this.nearbyPlatforms,
        );
    }

    protected getClosestRoutesByCumulatedDistance(rightDirectionPois: RouteWithDistance[]): RouteWithAveragedDistance[] {
        return (rightDirectionPois
            .map(guess => {
                const currentDistance = guess.distance.value;
                const history = this.fullHistory;
                const previousDistance = history[history.length - 1]?.find(isGuessFor(guess.poi))?.distance.value ?? currentDistance;
                const prePreviousDistance = history[history.length - 2]?.find(isGuessFor(guess.poi))?.distance.value ?? previousDistance;
                const averagedDistance = (currentDistance + previousDistance + prePreviousDistance) / 3;
                return {
                    guess,
                    averagedDistance
                };
            })
            .sort((a, b) => a.averagedDistance - b.averagedDistance))
            .reduce((acc, guess) => {
                if (acc.minDistance < guess.averagedDistance) return acc;
                if (acc.minDistance === guess.averagedDistance) {
                    acc.points.push(guess);
                    return acc;
                }
                return {
                    minDistance: guess.averagedDistance,
                    points: [guess]
                };
            }, { minDistance: Infinity, points: [] as RouteWithAveragedDistance[] })
            .points;
    }
}
