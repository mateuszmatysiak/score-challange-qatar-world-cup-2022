import type { Prisma } from "@prisma/client";
import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useCatch, useLoaderData } from "@remix-run/react";
import { groupBy } from "lodash";
import { Fragment } from "react";

import { MatchCard } from "~/components/match-card/match-card";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

type UserMatch = Prisma.UserMatchGetPayload<{
  select: {
    id: true;
    homeTeamScore: true;
    awayTeamScore: true;
    goalScorer: true;
    match: {
      select: {
        id: true;
        playoff: true;
        group: true;
        homeTeam: true;
        awayTeam: true;
        stadium: true;
        stage: true;
        startDate: true;
      };
    };
  };
}>;

type LoaderData = {
  userMatches: UserMatch[];
};

const todayDate = new Date(new Date().setHours(0, 0, 0, 0)); // Today
const twoDaysLater = new Date(new Date().setHours(48, 59, 59, 999)); // 2 days after

export const loader: LoaderFunction = async ({ request }) => {
  const userId = await getUserId(request);

  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const userMatches = await db.userMatch.findMany({
    where: {
      userId,
      match: { startDate: { lt: twoDaysLater, gt: todayDate } },
    },
    orderBy: [{ match: { startDate: "asc" } }],
    select: {
      id: true,
      homeTeamScore: true,
      awayTeamScore: true,
      goalScorer: true,
      match: {
        select: {
          id: true,
          playoff: true,
          group: true,
          homeTeam: true,
          awayTeam: true,
          stadium: true,
          stage: true,
          startDate: true,
        },
      },
    },
  });

  return json({ userMatches });
};

export default function GameRoute() {
  const { userMatches } = useLoaderData<LoaderData>();

  const formattedMatches = userMatches.map((userMatch) => {
    const todayDate = new Date().toLocaleDateString();
    const matchDate = new Date(userMatch.match.startDate).toLocaleDateString();

    return {
      ...userMatch,
      groupedByKey: todayDate === matchDate ? "today" : "tomorrow",
    };
  });

  const groupedUserMatches = groupBy(formattedMatches, "groupedByKey");

  return (
    <div className="relative flex flex-col gap-6">
      {Object.entries(groupedUserMatches).map(([key, userMatches], index) => {
        return (
          <Fragment key={key}>
            <h2 className="text-24-medium">
              {index === 0 ? "Today" : "Tomorrow"} Matches
            </h2>

            <div className="grid grid-cols-matches gap-4">
              {userMatches.map(({ id, ...userMatch }) => (
                <MatchCard key={id} {...userMatch} />
              ))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function CatchBoundary() {
  const caught = useCatch();

  if (caught.status === 401) {
    return (
      <div>
        <p>You must be logged in to play a game.</p>
        <Link to="/login">Login</Link>
      </div>
    );
  }
}
