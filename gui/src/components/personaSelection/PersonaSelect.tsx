import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectPersonaByName,
  selectPersonas,
} from "../../redux/slices/configSlice";
import { setSelectedPersona } from "../../redux/slices/sessionSlice";
import { CONFIG_ROUTES } from "../../util/navigation";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "../ui";
import {
  DEFAULT_PERSONAS,
  isDefaultPersona,
} from "../../pages/config/sections/defaultPersonas";

function PersonaSelect() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const configPersonas = useAppSelector(selectPersonas);
  const selectedPersonaName = useAppSelector(
    (store) => store.session.selectedPersona,
  );
  const selectedPersona = useAppSelector((state) =>
    selectedPersonaName
      ? selectPersonaByName(state, selectedPersonaName)
      : null,
  );

  // Merge default personas with custom personas from config
  const allPersonas = useMemo(() => {
    // Create maps for default persona overrides from config
    const defaultPersonaOverrides = new Map<
      string,
      { customInstructions?: string }
    >();
    if (configPersonas) {
      configPersonas.forEach((p: any) => {
        if (isDefaultPersona(p.name)) {
          const overrides: { customInstructions?: string } = {};
          if (p.customInstructions) {
            overrides.customInstructions = p.customInstructions;
          }
          if (Object.keys(overrides).length > 0) {
            defaultPersonaOverrides.set(p.name, overrides);
          }
        }
      });
    }

    // Start with default personas
    const defaultPersonas = DEFAULT_PERSONAS.map((defaultPersona) => {
      const overrides = defaultPersonaOverrides.get(defaultPersona.name) || {};
      return {
        ...defaultPersona,
        customInstructions: overrides.customInstructions || "",
      };
    });

    // Add custom personas (non-default ones from config)
    const customPersonas = configPersonas
      ? configPersonas
          .filter((m: any) => !isDefaultPersona(m.name))
          .map((m: any) => ({
            name: m.name,
            apiConfiguration: m.apiConfiguration || "default",
            roleDefinition: m.roleDefinition || "",
            shortDescription: m.shortDescription || "",
            whenToUse: m.whenToUse || "",
            availableTools: m.availableTools || "",
            customInstructions: m.customInstructions || "",
          }))
      : [];

    return [...defaultPersonas, ...customPersonas];
  }, [configPersonas]);

  // Auto-select first persona if none is selected
  useEffect(() => {
    if (!selectedPersonaName && allPersonas.length > 0) {
      dispatch(setSelectedPersona(allPersonas[0].name));
    }
  }, [selectedPersonaName, allPersonas, dispatch]);

  const handlePersonaSelect = (personaName: string | null) => {
    if (personaName === "none") {
      dispatch(setSelectedPersona(null));
    } else if (personaName) {
      dispatch(setSelectedPersona(personaName));
    }
  };

  // Find persona by name in allPersonas (works for both builtin and custom)
  const currentPersona = useMemo(() => {
    if (!selectedPersonaName) return null;
    return allPersonas.find((p) => p.name === selectedPersonaName) || null;
  }, [selectedPersonaName, allPersonas]);

  const displayName = currentPersona
    ? currentPersona.name
    : selectedPersonaName || "No Persona";

  // Use currentPersona name or "none" for Listbox value
  const listboxValue = currentPersona
    ? currentPersona.name
    : selectedPersonaName || "none";

  return (
    <Listbox value={listboxValue} onChange={handlePersonaSelect}>
      <div className="relative flex">
        <ListboxButton
          data-testid="persona-select-button"
          className="text-description h-[18px] gap-1 border-none"
        >
          <span className="line-clamp-1 break-all hover:brightness-110">
            {displayName}
          </span>
          <ChevronDownIcon
            className="hidden h-2 w-2 flex-shrink-0 hover:brightness-110 min-[200px]:flex"
            aria-hidden="true"
          />
        </ListboxButton>
        <ListboxOptions className="min-w-[160px]">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-description text-xs font-medium">
              Personas
            </span>
          </div>

          <div className="no-scrollbar max-h-[300px] overflow-y-auto">
            <ListboxOption value="none">
              <div className="flex items-center gap-2 py-0.5">
                <span className="line-clamp-1">No Persona</span>
              </div>
            </ListboxOption>
            {allPersonas.length > 0 && (
              <>
                <div className="my-1 border-t border-gray-600" />
                {allPersonas.map((persona, idx) => (
                  <ListboxOption
                    key={idx}
                    value={persona.name}
                    className={`group ${selectedPersonaName === persona.name ? "bg-list-active text-list-active-foreground" : ""}`}
                  >
                    <div className="flex w-full flex-col gap-0.5 py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-1">
                          {persona.name}
                          {isDefaultPersona(persona.name) && (
                            <span className="text-description-muted ml-1.5 text-[10px]">
                              (Builtin)
                            </span>
                          )}
                        </span>
                      </div>
                      {persona.shortDescription && (
                        <div className="text-description-muted line-clamp-1 text-[10px]">
                          {persona.shortDescription}
                        </div>
                      )}
                    </div>
                  </ListboxOption>
                ))}
              </>
            )}
          </div>

          <div className="my-1 border-t border-gray-600" />
          <div className="text-description flex items-center justify-start p-2">
            <span
              className="text-description-muted hover:text-foreground cursor-pointer text-xs underline"
              onClick={() => navigate(CONFIG_ROUTES.PERSONA)}
            >
              Configure personas
            </span>
          </div>
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

export default PersonaSelect;
