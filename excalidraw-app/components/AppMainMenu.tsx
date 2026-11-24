import {
  loginIcon,
  ExcalLogo,
  eyeIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import { isExcalidrawPlusSignedUser } from "../app_constants";
import { useAtomValue, useSetAtom } from "../app-jotai";
import { signOut } from "../auth/AuthProvider";
import {
  authDialogOpenAtom,
  authStatusAtom,
  authUserAtom,
  nameDialogOpenAtom,
} from "../auth/authAtoms";
import { navigate } from "../cloud/routes";
import { isCloudEnabled } from "../lib/api";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  refresh: () => void;
}> = React.memo((props) => {
  const { t } = useI18n();
  const user = useAtomValue(authUserAtom);
  const authStatus = useAtomValue(authStatusAtom);
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const setNameDialogOpen = useSetAtom(nameDialogOpenAtom);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/dashboard");
    }
  };

  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.ItemLink
        icon={ExcalLogo}
        href={`${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=excalidraw&utm_medium=app&utm_content=hamburger`}
        className=""
      >
        Excalidraw+
      </MainMenu.ItemLink>
      <MainMenu.DefaultItems.Socials />
      {isCloudEnabled() ? (
        authStatus === "loading" ? null : user ? (
          <>
            <MainMenu.Item onSelect={() => setNameDialogOpen(true)}>
              Profile name
            </MainMenu.Item>
            <MainMenu.Item
              icon={loginIcon}
              onSelect={() => navigate("/dashboard")}
            >
              My boards
            </MainMenu.Item>
            <MainMenu.Item onSelect={handleSignOut}>Sign out</MainMenu.Item>
          </>
        ) : (
          <>
            <MainMenu.Item
              icon={loginIcon}
              onSelect={() => setAuthDialogOpen(true)}
              className="highlighted"
            >
              {t("labels.signIn")}
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => setNameDialogOpen(true)}>
              Your name
            </MainMenu.Item>
          </>
        )
      ) : (
        <MainMenu.ItemLink
          icon={loginIcon}
          href={`${import.meta.env.VITE_APP_PLUS_APP}${
            isExcalidrawPlusSignedUser ? "" : "/sign-up"
          }?utm_source=signin&utm_medium=app&utm_content=hamburger`}
          className="highlighted"
        >
          {isExcalidrawPlusSignedUser ? t("labels.signIn") : t("labels.signUp")}
        </MainMenu.ItemLink>
      )}
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
