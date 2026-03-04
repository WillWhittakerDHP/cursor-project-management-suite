**Instructions for AI / tooling:** Treat the findings in this report as canonical. Do not plan or change the audit scripts unless you have asked the user and received explicit approval to do so.

**When fixing a finding:** Search the codebase for the same rule or pattern (same ruleId or equivalent) and fix all similar occurrences consistently. Ensure the fix does not introduce new violations of this or related rules.


# Typecheck Audit Summary (Generated)

Generated from `client/.audit-reports/typecheck/typecheck-audit.json`.

## Pool index (ranked)

| Priority | Pool | score | errors | files | severity | blast | repetition | unsafeCasts | suppressions |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P0 | `TS2304-ts2304-cannot-find-name-globalentityid` | 136 | 12 | 2 | 120 | 4 | 12 | 0 | 0 |
| P0 | `TS18048-ts18048-vls-ctx-formdata-is-possibly-undefined` | 49 | 5 | 2 | 40 | 4 | 5 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-timeslot` | 46 | 4 | 1 | 40 | 2 | 4 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-iso8601date` | 37 | 3 | 2 | 30 | 4 | 3 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-timerange` | 37 | 3 | 2 | 30 | 4 | 3 | 0 | 0 |
| P0 | `TS2307-ts2307-cannot-find-module-bookingfinaltypes-or-its-corresponding-type-declarations` | 37 | 3 | 2 | 30 | 4 | 3 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-globalentitykey` | 35 | 3 | 1 | 30 | 2 | 3 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-relationshipcollectionref` | 35 | 3 | 1 | 30 | 2 | 3 | 0 | 0 |
| P0 | `TS2322-ts2322-assign-boolean-computedref` | 35 | 3 | 1 | 30 | 2 | 3 | 0 | 0 |
| P0 | `TS2322-ts2322-assign-computedref-boolean` | 35 | 3 | 1 | 30 | 2 | 3 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-globalfieldkey` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2322-ts2322-assign` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2322-ts2322-assign-promise-promise` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-applypartinstancebulkedit` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-bulkeditdata` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-bulkeditmode` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-handlebulkeditconfirm` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-handlebulkeditmodalupdate` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2339-ts2339-prop-togglebulkeditmode` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2353-ts2353-object-literal-may-only-specify-known-properties-and-existingpartinstances-does-not-exist-in-type-usepartinstance` | 26 | 2 | 2 | 20 | 4 | 2 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-bookingmode` | 24 | 2 | 1 | 20 | 2 | 2 | 0 | 0 |
| P0 | `TS2304-ts2304-cannot-find-name-ternaryboolean` | 24 | 2 | 1 | 20 | 2 | 2 | 0 | 0 |
| P0 | `TS6133-ts6133-ref-is-declared-but-its-value-is-never-read` | 24 | 4 | 4 | 12 | 8 | 4 | 0 | 0 |
| P0 | `TS2741-ts2741-property-writablecomputedrefsymbol-is-missing-in-type-computedref-boolean-but-required-in-type-writablecomputedre` | 22 | 2 | 1 | 18 | 2 | 2 | 0 | 0 |
| P0 | `TS2741-ts2741-property-writablecomputedrefsymbol-is-missing-in-type-computedref-string-undefined-but-required-in-type-writablec` | 22 | 2 | 1 | 18 | 2 | 2 | 0 | 0 |
| P0 | `TS6133-ts6133-computedref-is-declared-but-its-value-is-never-read` | 18 | 3 | 3 | 9 | 6 | 3 | 0 | 0 |
| P0 | `TS6133-ts6133-globalentity-is-declared-but-its-value-is-never-read` | 18 | 3 | 3 | 9 | 6 | 3 | 0 | 0 |
| P0 | `TS6133-ts6133-globalfieldkey-is-declared-but-its-value-is-never-read` | 18 | 3 | 3 | 9 | 6 | 3 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-availabilitystepdata` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-distributionpreview` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-distributionstrategy` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-fieldlocation` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-fieldmetadataentry` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-globalrelationship` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-instancecomponent` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-placedetails` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2304-ts2304-cannot-find-name-selectedtimeslot` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2307-ts2307-cannot-find-module-utils-booking-slotperspective-or-its-corresponding-type-declarations` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2307-ts2307-cannot-find-module-utils-dependencycleanup-or-its-corresponding-type-declarations` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2320-ts2320-interface-usewizarddevmodeoptions-cannot-simultaneously-extend-types-wizarddevoptionsbase-and-omit-devpanelbutton` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-betafeedback-null-undefined-betafeedback-null` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-boolean-undefined-boolean` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-expansion-selectioncardconfig` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-number` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-number-text-select-reference-multiselect-statusbutton-iconselect-relationshipcollection-string` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-ref-ref-record` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-searchresultsgroup-undefined-searchresultsgroup` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-string-number-text-select-reference-multiselect-statusbutton-iconselect-relationshipcollection-undefined` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-string-roundup-rounddown-roundnearest` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2322-ts2322-assign-unknown-string-routelocationaspathgeneric-routelocationasrelativegeneric-undefined` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2339-ts2339-prop-active-blockshapeformdata-partshapeformdata` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2339-ts2339-prop-length` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-any-any` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-any-number-any-number` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-htmlelement-componentpublicinstance-htmlelement-null` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-null-null` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-orderindexupdate-record` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-string-service-status-appointmentid-city-state-zipcode-fulladdress-streetaddress-appointmentdate-appointmentt` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-string-slottimebounds-timeslot` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2345-ts2345-arg-usewizarddevmodeoptions` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2352-ts2352-conversion-of-type-computedref-globalentity-blockinstance-blockshape-partinstance-partshape-eventshape-eventinsta` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2362-ts2362-the-left-hand-side-of-an-arithmetic-operation-must-be-of-type-any-number-bigint-or-an-enum-type` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2363-ts2363-the-right-hand-side-of-an-arithmetic-operation-must-be-of-type-any-number-bigint-or-an-enum-type` | 13 | 1 | 1 | 10 | 2 | 1 | 0 | 0 |
| P1 | `TS2739-ts2739-type-getconfig-adminconfig-rebuildconfig-void-getformfieldconfig-ge-extends-globalentitykey-fieldkey-extends-glob` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2739-ts2739-type-ref-boolean-boolean-is-missing-the-following-properties-from-type-computedref-boolean-effect-computedrefsymb` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2739-ts2739-type-ref-fieldcontexttype-blockinstance-blockshape-partinstance-partshape-eventshape-eventinstance-annotationshap` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2740-ts2740-type-adminconfig-is-missing-the-following-properties-from-type-getconfig-adminconfig-rebuildconfig-void-getformfi` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2741-ts2741-property-writablecomputedrefsymbol-is-missing-in-type-computedref-groupkey-string-grouplabel-string-but-required-` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2741-ts2741-property-writablecomputedrefsymbol-is-missing-in-type-computedref-string-but-required-in-type-writablecomputedref` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS2769-ts2769-no-overload-matches-this-call` | 12 | 1 | 1 | 9 | 2 | 1 | 0 | 0 |
| P1 | `TS6133-ts6133-bookingblockinstance-is-declared-but-its-value-is-never-read` | 12 | 2 | 2 | 6 | 4 | 2 | 0 | 0 |
| P1 | `TS6133-ts6133-entityid-is-declared-but-its-value-is-never-read` | 12 | 2 | 2 | 6 | 4 | 2 | 0 | 0 |
| P1 | `TS6133-ts6133-fieldmetadataentry-is-declared-but-its-value-is-never-read` | 12 | 2 | 2 | 6 | 4 | 2 | 0 | 0 |
| P1 | `TS6133-ts6133-globalentitykey-is-declared-but-its-value-is-never-read` | 12 | 2 | 2 | 6 | 4 | 2 | 0 | 0 |
| P1 | `TS18004-ts18004-no-value-exists-in-scope-for-the-shorthand-property-handledeletechild-either-declare-one-or-provide-an-initializ` | 11 | 1 | 1 | 8 | 2 | 1 | 0 | 0 |
| P1 | `TS18004-ts18004-no-value-exists-in-scope-for-the-shorthand-property-handledeletechildbyid-either-declare-one-or-provide-an-initi` | 11 | 1 | 1 | 8 | 2 | 1 | 0 | 0 |
| P1 | `TS18048-ts18048-items-value-is-possibly-undefined` | 11 | 1 | 1 | 8 | 2 | 1 | 0 | 0 |
| P1 | `TS7006-ts7006-parameter-part-implicitly-has-an-any-type` | 10 | 1 | 1 | 7 | 2 | 1 | 0 | 0 |
| P1 | `TS7006-ts7006-parameter-partacc-implicitly-has-an-any-type` | 10 | 1 | 1 | 7 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-appointmentslots-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-areslotsequal-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-autocompleteprediction-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-componentitem-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-effectiveparententity-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-eventinstanceids-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-eventinstancesdraghandlers-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-eventinstancespanelscontainer-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-field-layout-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-fieldcontexttype-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-formref-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-getrelationshipcollectioninstance-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-globalentityid-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-partscollectionref-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-propertydetailsstepdata-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-ref-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-refloadingindicator-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-relationshipcollection-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-relationshipkey-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-relationships-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-removerelationship-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-selectdomtarget-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-selectgroup-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-selectioncarditem-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-stepvalidators-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-useentitydraghandlers-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-useinstanceblockinstancesbyshapeoptions-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6133-ts6133-usenotification-is-declared-but-its-value-is-never-read` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6192-ts6192-all-imports-in-import-declaration-are-unused` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-apicallstatus-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-appointmentshape-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-appointmentslot-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-devpanelscomputeddata-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-mutationcontextwithpreviousdata-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-patchorderindex-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-propertyformstatecore-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-selectioncarditem-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6196-ts6196-selectioncarditemwithcomponents-is-declared-but-never-used` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |
| P2 | `TS6198-ts6198-all-destructured-elements-are-unused` | 6 | 1 | 1 | 3 | 2 | 1 | 0 | 0 |

## File index (ranked)

| File | errors | unsafeCasts | suppressions |
| --- | ---: | ---: | ---: |
| `src/composables/componentEntity/useComponentEntityDomain.ts` | 11 | 0 | 0 |
| `src/utils/booking/partFinalizer.ts` | 9 | 0 | 0 |
| `src/components/admin/generic/collections/PartsCollection.vue` | 7 | 0 | 0 |
| `src/composables/admin/usePartInstanceCollection.ts` | 7 | 0 | 0 |
| `src/views/admin/tabs/InstancesTab.vue` | 7 | 0 | 0 |
| `src/composables/admin/useEntityCardSubPanels.ts` | 6 | 0 | 0 |
| `src/composables/booking/useAppointmentTimes.ts` | 6 | 0 | 0 |
| `src/components/admin/generic/EntityCard.vue` | 5 | 0 | 0 |
| `src/views/admin/entities/BlockShapeForm.vue` | 5 | 0 | 0 |
| `src/components/booking/BookingWizard.vue` | 4 | 0 | 0 |
| `src/composables/admin/useRelationshipCollection.ts` | 4 | 0 | 0 |
| `src/composables/admin/useShapeForm.ts` | 4 | 0 | 0 |
| `src/composables/useComponentDistribution.ts` | 4 | 0 | 0 |
| `src/utils/transformers/globalToBookingTransformer.ts` | 4 | 0 | 0 |
| `src/components/beta/BetaFeedbackDashboard.vue` | 3 | 0 | 0 |
| `src/composables/admin/useEntityCardFieldContextAndVisibility.ts` | 3 | 0 | 0 |
| `src/composables/admin/useFieldContextManager.ts` | 3 | 0 | 0 |
| `src/composables/admin/useSelectConfig.ts` | 3 | 0 | 0 |
| `src/composables/booking/useDevPanelsComputed.ts` | 3 | 0 | 0 |
| `src/composables/booking/usePropertyDetailsLogic.ts` | 3 | 0 | 0 |
| `src/layouts/components/NavSearchBar.vue` | 3 | 0 | 0 |
| `src/views/admin/entities/PartShapeForm.vue` | 3 | 0 | 0 |
| `src/components/admin/generic/collections/RelationshipCollection.vue` | 2 | 0 | 0 |
| `src/components/admin/metadata/AdminPrimitiveMetadataEditor.vue` | 2 | 0 | 0 |
| `src/components/booking/AppointmentSlotGrid.vue` | 2 | 0 | 0 |
| `src/composables/admin/useEntityStatus.ts` | 2 | 0 | 0 |
| `src/composables/admin/useFieldComponent.ts` | 2 | 0 | 0 |
| `src/composables/admin/useFieldLocation.ts` | 2 | 0 | 0 |
| `src/composables/admin/useSelectDomTargets.ts` | 2 | 0 | 0 |
| `src/composables/booking/selectionCard/useSelectionCard.ts` | 2 | 0 | 0 |
| `src/composables/booking/selectionCard/useSelectionCardGroupState.ts` | 2 | 0 | 0 |
| `src/composables/booking/selectionCard/useSelectionCardState.ts` | 2 | 0 | 0 |
| `src/composables/booking/useAppointmentSlots.ts` | 2 | 0 | 0 |
| `src/composables/booking/useAvailabilityDefaults.ts` | 2 | 0 | 0 |
| `src/composables/booking/useAvailabilityStepData.ts` | 2 | 0 | 0 |
| `src/composables/booking/useInstanceComponents.ts` | 2 | 0 | 0 |
| `src/utils/booking/BlockFinal.ts` | 2 | 0 | 0 |
| `src/components/admin/generic/EntityCardSubPanels.vue` | 1 | 0 | 0 |
| `src/components/admin/generic/fields/FieldRenderer.vue` | 1 | 0 | 0 |
| `src/components/beta/BetaFeedbackModal.vue` | 1 | 0 | 0 |
| `src/components/booking/DifferentialGraph.vue` | 1 | 0 | 0 |
| `src/components/booking/SelectionCard.vue` | 1 | 0 | 0 |
| `src/components/booking/steps/AvailabilityOptionsSection.vue` | 1 | 0 | 0 |
| `src/components/common/AddressAutocomplete.vue` | 1 | 0 | 0 |
| `src/composables/admin/useEntityCardFieldConfiguration.ts` | 1 | 0 | 0 |
| `src/composables/admin/useEntityCardFormSetup.ts` | 1 | 0 | 0 |
| `src/composables/admin/useEntityDragHandlers.ts` | 1 | 0 | 0 |
| `src/composables/admin/useEntityTabState.ts` | 1 | 0 | 0 |
| `src/composables/admin/useInstanceBulkEdit.ts` | 1 | 0 | 0 |
| `src/composables/admin/useInstanceComposableOptions.ts` | 1 | 0 | 0 |
| `src/composables/admin/useInstancesTabCreateModal.ts` | 1 | 0 | 0 |
| `src/composables/admin/useInstancesTabEventInstance.ts` | 1 | 0 | 0 |
| `src/composables/admin/useInstancesTabEventInstanceDrag.ts` | 1 | 0 | 0 |
| `src/composables/admin/useMetadataFieldDrag.ts` | 1 | 0 | 0 |
| `src/composables/admin/usePrimitiveMetadataSave.ts` | 1 | 0 | 0 |
| `src/composables/admin/useRelationshipCollectionData.ts` | 1 | 0 | 0 |
| `src/composables/admin/useSelectFiltering.ts` | 1 | 0 | 0 |
| `src/composables/admin/useSelectGroupedByKey.ts` | 1 | 0 | 0 |
| `src/composables/admin/useSelectLabelResolution.ts` | 1 | 0 | 0 |
| `src/composables/admin/useStatusButtonHandlers.ts` | 1 | 0 | 0 |
| `src/composables/admin/useStatusButtonToggle.ts` | 1 | 0 | 0 |
| `src/composables/booking/selectionCard/useSelectionCardHandlers.ts` | 1 | 0 | 0 |
| `src/composables/booking/useApiCallStatus.ts` | 1 | 0 | 0 |
| `src/composables/booking/useAvailabilityUI.ts` | 1 | 0 | 0 |
| `src/composables/booking/useComputedAvailability.ts` | 1 | 0 | 0 |
| `src/composables/booking/useDependentInstances.ts` | 1 | 0 | 0 |
| `src/composables/booking/useInstanceDisplay.ts` | 1 | 0 | 0 |
| `src/composables/booking/usePropertyTypesLabel.ts` | 1 | 0 | 0 |
| `src/composables/booking/useSlotGridDisplay.ts` | 1 | 0 | 0 |
| `src/composables/booking/useWizardDevMode.ts` | 1 | 0 | 0 |
| `src/composables/entityCrud/useSharedMutationHandlers.ts` | 1 | 0 | 0 |
| `src/layouts/blank.vue` | 1 | 0 | 0 |
| `src/types/booking/wizardDevMode.ts` | 1 | 0 | 0 |
| `src/utils/fieldContext/fieldContextSaveHelpers.ts` | 1 | 0 | 0 |
| `src/views/admin/entities/BlockInstanceList.vue` | 1 | 0 | 0 |
| `src/views/admin/tabs/BusinessControlsTab.vue` | 1 | 0 | 0 |
| `src/views/admin/tabs/components/AppointmentsTable.vue` | 1 | 0 | 0 |

## Notes

- This is a *signal* index. Use `client/.audit-reports/typecheck/typecheck-audit.md` for detailed errors.
- Priority from config: `client/.audit-reports/typecheck/typecheck-audit-config.json`.
