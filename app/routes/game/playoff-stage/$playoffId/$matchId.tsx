import type { Prisma } from "@prisma/client";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  useActionData,
  useCatch,
  useLoaderData,
  useParams,
} from "@remix-run/react";
import { Fragment } from "react";
import { ErrorCard } from "~/components/error-card";
import { GoalScorer } from "~/components/match-card-form/goal-scorer";
import { NoGoalScorer } from "~/components/match-card-form/no-goal-scorer";
import { MatchCardDetails } from "~/components/match-card/match-details";
import { MatchCardTeamFlag } from "~/components/match-card/match-team-flag";
import { SubmitButton } from "~/components/submit-button";

import { db } from "~/utils/db.server";
import { requireUser } from "~/utils/session.server";

/* Funkcja walidująca request */

const badRequest = (data: ActionData) => json(data, { status: 400 });

/* Typy dla Action */

type HiddenActionFields = {
  userMatchId: number;
  homeTeamId: string;
  awayTeamId: string;
  matchStartDate: string;
};

type ActionFields = {
  hidden: HiddenActionFields;
  homeTeamScore: string;
  awayTeamScore: string;
  goalScorerId: string;
};

type ActionData = {
  formError?: string;
  fieldErrors?: {
    goalScorerId: string | undefined;
  };
  fields?: ActionFields;
};

/* Typy dla określania wyniku */

type UserMatch = Prisma.UserMatchGetPayload<{
  select: {
    id: true;
    homeTeamScore: true;
    awayTeamScore: true;
    goalScorerId: true;
    match: {
      select: {
        id: true;
        group: true;
        playoff: true;
        homeTeam: true;
        awayTeam: true;
        stadium: true;
        stage: true;
        startDate: true;
      };
    };
  };
}>;

/* Typy dla określania zawodnika */

type Player = Prisma.PlayerGetPayload<{
  select: {
    id: true;
    name: true;
    team: true;
    teamId: true;
    userMatches: { select: { goalScorerId: true } };
  };
}>;

/* Typy dla Loader */

interface LoaderData {
  userMatch: UserMatch;
  homeTeamPlayers: Player[];
  awayTeamPlayers: Player[];
}

export const loader: LoaderFunction = async ({ request, params }) => {
  const loggedInUser = await requireUser(request);

  const matchId = Number(params.matchId?.split("-")[1]);

  /* Pobieranie meczu użytkownika */

  const userMatch = await db.userMatch.findFirst({
    where: { userId: loggedInUser.id, match: { id: matchId } },
    orderBy: [{ match: { startDate: "asc" } }],
    select: {
      id: true,
      homeTeamScore: true,
      awayTeamScore: true,
      goalScorerId: true,
      match: {
        select: {
          id: true,
          group: true,
          playoff: true,
          homeTeam: true,
          awayTeam: true,
          stadium: true,
          stage: true,
          startDate: true,
        },
      },
    },
  });

  if (!userMatch) {
    throw new Response("Match not found.", { status: 404 });
  }

  /* Pobieranie zawodników w danym meczu */

  const homeTeamId = String(userMatch?.match.homeTeam?.id);
  const awayTeamId = String(userMatch?.match.awayTeam?.id);

  const players = await db.player.findMany({
    where: { teamId: { in: [homeTeamId, awayTeamId] } },
    select: {
      id: true,
      name: true,
      team: true,
      teamId: true,
      userMatches: {
        select: { goalScorerId: true },
        where: { userId: loggedInUser.id, matchId },
      },
    },
  });

  const homeTeamPlayers = players.filter(({ teamId }) => teamId === homeTeamId);
  const awayTeamPlayers = players.filter(({ teamId }) => teamId === awayTeamId);

  return json({ userMatch, homeTeamPlayers, awayTeamPlayers });
};

export const action: ActionFunction = async ({ request, params }) => {
  await requireUser(request);

  const form = await request.formData();

  /* hidden */
  const hidden = form.get("hidden") as string;
  const hiddenFields = JSON.parse(hidden) as HiddenActionFields;
  const { userMatchId, homeTeamId, awayTeamId, matchStartDate } = hiddenFields;

  const homeTeamScore = form.get("homeTeamScore");
  const awayTeamScore = form.get("awayTeamScore");
  const goalScorerId = form.get("goalScorerId");

  const currentDateMs = Date.now();
  const matchStartDateMs = Date.parse(matchStartDate);

  if (currentDateMs > matchStartDateMs) {
    return badRequest({
      formError: "Match started or ended, cannot change bets.",
    });
  }

  if (!homeTeamId || !awayTeamId) {
    return badRequest({ formError: "Teams have not yet been selected." });
  }

  if (!homeTeamScore || !awayTeamScore) {
    return badRequest({ formError: "No result selected." });
  }

  /* Aktualizacja meczu użytkownika */

  await db.userMatch.update({
    where: { id: userMatchId },
    data: {
      goalScorerId: Number(goalScorerId) !== 0 ? Number(goalScorerId) : null,
      homeTeamScore: Number(homeTeamScore),
      awayTeamScore: Number(awayTeamScore),
    },
  });

  return redirect(`/game/playoff-stage/${params.playoffId}`);
};

export default function PlayoffMatchRoute() {
  const actionData = useActionData<ActionData>();
  const { userMatch, homeTeamPlayers, awayTeamPlayers } =
    useLoaderData<LoaderData>();

  const { match, goalScorerId } = userMatch;
  const { homeTeam, awayTeam } = match;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-48-bold">Match Betting</h1>

      <div className="flex flex-col bg-white rounded-md p-6 gap-6">
        <MatchCardDetails match={match} />

        <Form method="post" className="flex flex-col gap-6">
          <div className="grid grid-cols-match-form-card items-center gap-4">
            {/* Hidden field */}
            <input
              hidden
              name="hidden"
              defaultValue={JSON.stringify({
                userMatchId: userMatch.id,
                homeTeamId: userMatch.match.homeTeam?.id,
                awayTeamId: userMatch.match.awayTeam?.id,
                matchStartDate: userMatch.match.startDate,
              })}
            />
            {/* Hidden field */}

            <div className="flex items-center justify-end gap-4">
              <label htmlFor="homeTeamScore" className="text-48-bold">
                {userMatch.match.homeTeam?.name ?? "Team A"}
              </label>
              <MatchCardTeamFlag
                size="large"
                src={homeTeam?.flag}
                alt={homeTeam?.name}
              />
            </div>
            <div className="m-auto">
              <input
                id="homeTeamScore"
                type="number"
                name="homeTeamScore"
                defaultValue={userMatch.homeTeamScore ?? ""}
                min="0"
                className="w-[80px] border-b-2 border-dark-blue text-48-bold text-center"
              />
              <span> - </span>
              <input
                id="awayTeamScore"
                type="number"
                name="awayTeamScore"
                defaultValue={userMatch.awayTeamScore ?? ""}
                min="0"
                className="w-[80px] border-b-2 border-dark-blue text-48-bold text-center"
              />
            </div>
            <div className="flex items-center justify-start gap-4">
              <MatchCardTeamFlag
                size="large"
                src={awayTeam?.flag}
                alt={awayTeam?.name}
              />
              <label htmlFor="awayTeamScore" className="text-48-bold">
                {userMatch.match.awayTeam?.name ?? "Team B"}
              </label>
            </div>
          </div>

          <hr />

          <NoGoalScorer goalScorerId={goalScorerId} />

          <div className="flex gap-4">
            <ul className="flex flex-col flex-1 gap-1">
              <li className="text-24-bold mb-2">
                {userMatch.match.homeTeam?.name} Team Players
              </li>

              {homeTeamPlayers?.map((player, index) => (
                <Fragment key={player.id}>
                  <GoalScorer {...player} />

                  {index !== homeTeamPlayers.length - 1 ? <hr /> : null}
                </Fragment>
              ))}
            </ul>

            <ul className="flex flex-col flex-1 gap-1">
              <li className="text-24-bold mb-2">
                {userMatch.match.awayTeam?.name} Team Players
              </li>

              {awayTeamPlayers.map((player, index) => (
                <Fragment key={player.id}>
                  <GoalScorer {...player} />

                  {index !== awayTeamPlayers.length - 1 ? <hr /> : null}
                </Fragment>
              ))}
            </ul>
          </div>

          {actionData?.formError ? (
            <ErrorCard>{actionData.formError}</ErrorCard>
          ) : null}

          <div className="flex justify-end">
            <SubmitButton />
          </div>
        </Form>
      </div>
    </div>
  );
}

export function CatchBoundary() {
  const caught = useCatch();
  const params = useParams();

  if (caught.status === 404) {
    return (
      <p className="text-20-medium mb-4">
        Match with id "{params.matchId}" not found.
      </p>
    );
  }
  throw new Error(`Unhandled error: ${caught.status}`);
}

export function ErrorBoundary() {
  const { matchId } = useParams();
  return (
    <p className="text-20-medium">{`There was an error loading match by the id ${matchId}. Sorry.`}</p>
  );
}
