// https://wiki.lyrasis.org/display/VIVODOC110x/Person+Model

module.exports = (uri, graph='?g') => `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX bibo: <http://purl.org/ontology/bibo/>
PREFIX vivo: <http://vivoweb.org/ontology/core#>
PREFIX vitro: <http://vitro.mannlib.cornell.edu/ns/vitro/0.7#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
PREFIX cito: <http://purl.org/spar/cito/>
PREFIX obo: <http://purl.obolibrary.org/obo/>
PREFIX ucd: <http://ucdavis.edu/ns/>
PREFIX ucdrp: <http://experts.library.ucdavis.edu/individual/>

CONSTRUCT {
  ?subject rdf:type ?type .

  ?subject rdfs:label ?label .
  ?subject vivo:scopusId ?scopusId .
  ?subject vivo:researcherId ?researcherId .
  ?subject vivo:eRACommonsId ?eRACommonsId .
  ?subject vivo:overview ?overview .

  ?subject ucd:casId ?casId .

  ?subject vivo:orcidId ?orcidId .
  ?orcidId vivo:confirmedOrcidId ?confirmedOrcidId .

  ?subject vivo:hasResearchArea ?hasResearchArea .

  ?subject obo:contactInfoFor ?contactInfoFor .
  ?contactInfoFor vcard:giveName ?givenName .
  ?contactInfoFor vcard:familyName ?familyName .
  ?contactInfoFor vcard:additionalName ?additionalName .
  ?contactInfoFor vcard:honorificPrefix ?honorificPrefix .
  ?contactInfoFor vcard:honorificSuffix ?honorificSuffix .

  ?contactInfoFor vcard:hasEmail ?vcardEmail .
  ?vcardEmail vcard:email ?email .
  ?vcardEmail rdf:type ?emailType .

  ?contactInfoFor vcard:title ?title .


} WHERE {
  GRAPH ${graph} { 

    ?subject rdf:type ?type .
    OPTIONAL { ?subject rdfs:label ?label . }
    OPTIONAL { ?subject vivo:scopusId ?scopusId . }
    OPTIONAL { ?subject vivo:researcherId ?researcherId . }
    OPTIONAL { ?subject vivo:eRACommonsId ?eRACommonsId . }
    OPTIONAL { ?subject vivo:overview ?overview . }

    OPTIONAL { ?subject ucd:casId ?casId . }

    OPTIONAL {
      ?subject vivo:orcidId ?orcidId .
      OPTIONAL { ?orcidId vivo:confirmedOrcidId ?confirmedOrcidId . }
    }

    OPTIONAL {
      ?subject vivo:hasResearchArea ?hasResearchArea .
    }

    OPTIONAL {
      ?subject obo:ARG_2000028 ?contactInfoFor .

      OPTIONAL { ?contactInfoFor vcard:hasName ?vcardName . }
      OPTIONAL { ?vcardName vcard:givenName ?givenName . }
      OPTIONAL { ?vcardName vcard:familyName ?familyName . }     
      OPTIONAL { ?vcardName vcard:additionalName ?additionalName . }
      OPTIONAL { ?vcardName vcard:honorificPrefix ?honorificPrefix . }
      OPTIONAL { ?vcardName vcard:honorificSuffix ?honorificSuffix . }

      OPTIONAL { ?contactInfoFor vcard:hasEmail ?vcardEmail . }
      OPTIONAL { ?vcardEmail vcard:email ?email . }
      OPTIONAL { ?vcardEmail rdf:type ?emailType . }

      OPTIONAL { ?contactInfoFor vcard:hasTitle ?vcardTitle . }
      OPTIONAL { ?vcardTitle vcard:title ?title . }
    }

    FILTER(?subject = <${uri}>)
  }
}`