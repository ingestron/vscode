// Categorised source discovery and compatible routes come from the CLI catalogue.
import { projectRecipe, projectRoutes, projectSources, type ProjectRecipe } from "@ingestron/cli";
import * as vscode from "vscode";
/** The source choices and composed questions for New project. */
export interface ProjectChoice extends ProjectRecipe {
  connector: string;
  via: string;
  connectivity: string;
}
/** Select a source, network reachability and one compatible ingestion route. */
export async function chooseProject(): Promise<ProjectChoice | undefined> {
  const sources = projectSources();
  const categories = ["All sources", ...new Set(sources.map((source) => source.category))];
  const category = await vscode.window.showQuickPick(categories, {
    title: "New project: source category",
    placeHolder: "Choose a category, or search all sources",
  });
  if (!category) return;
  const source = await vscode.window.showQuickPick(
    sources
      .filter((item) => category === "All sources" || item.category === category)
      .map((item) => ({
        label: item.title,
        description: item.id,
        detail: item.category,
        id: item.id,
      })),
    {
      title: "New project: connection",
      placeHolder: "Search connectors",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!source) return;
  const connectivity = await chooseNetwork(source.id);
  if (!connectivity) return;
  const route = await chooseRoute(source.id, connectivity);
  if (!route) return;
  return {
    connector: source.id,
    via: route.via,
    connectivity,
    ...projectRecipe(source.id, route.via, connectivity),
  };
}
async function chooseNetwork(connector: string): Promise<string | undefined> {
  const routes = projectRoutes(connector);
  const kinds = [...new Set(routes.flatMap((route) => route.connectivity))];
  const descriptions: Record<string, string> = {
    private: "Reached through a private network and ADF runtime",
    workspace: "Reachable from the Databricks workspace",
    public: "Reachable through a public endpoint",
  };
  const picked = await vscode.window.showQuickPick(
    kinds.map((kind) => ({ label: kind, description: descriptions[kind] })),
    { title: "New project: source reachability", placeHolder: "Where can the source be reached?" },
  );
  return picked?.label;
}

async function chooseRoute(connector: string, connectivity: string) {
  const routes = projectRoutes(connector, connectivity).map((route) => ({
    label: route.title,
    description: route.via,
    detail: `${route.method} · ${route.maturity}`,
    via: route.via,
  }));
  if (!routes.length) {
    await vscode.window.showErrorMessage("No supported route for this source and connectivity.");
    return;
  }
  return routes.length === 1
    ? routes[0]
    : await vscode.window.showQuickPick(routes, {
        title: "New project: ingestion route",
        placeHolder: "Choose the platforms that will ingest and store the data",
      });
}
