// https://wiki.lyrasis.org/display/VIVODOC110x/Publication+Model

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
  ?subject bibo:abstract ?abstract .
  ?subject bibo:doi ?doi .
  ?subject bibo:volume ?volume .
  ?subject bibo:issue ?issue .
  ?subject bibo:pageStart ?pageStart .
  ?subject bibo:pageEnd ?pageEnd .
  ?publicationDate vivo:dateTime ?dateTime .

  ?subject vivo:Authorship ?author .
  ?author vivo:rank ?authorRank .
  ?author vcard:hasName ?authorVcardName .
  ?authorVcardName vcard:givenName ?authorGivenName .
  ?authorVcardName vcard:middleName ?authorMiddleName .
  ?authorVcardName vcard:familyName ?authorFamilyName .
  ?author vivo:orcid ?authorOrcid .
  ?author rdfs:label ?authorLabel .

  ?subject obo:hasContactInfo ?hasContactInfo .
  ?hasContactInfo vcard:hasURL ?contactInfoHasUrl .
  ?contactInfoHasUrl vcard:url ?contactInfoUrl .
  ?contactInfoHasUrl vivo:rank ?contactInfoRank .
  ?contactInfoHasUrl rdfs:label ?contactInfoLabel .

  ?subject vivo:hasSubjectArea ?subjectArea .
  ?subjectArea rdfs:label ?subjectAreaLabel .

  ?subject bibo:Journal ?publicationVenue .
  ?publicationVenue rdfs:label ?publicationVenueLabel .
  ?publicationVenue bibo:issn ?publicationVenueIssn .

  ?subject vivo:informationResourceSupportedBy ?supportedBy .
  ?supportedBy rdfs:label ?supportedByLabel .

  ?subject vivo:publicationDate ?publicationDateTime .

} WHERE {
  GRAPH ${graph} { 

    ?subject rdf:type ?type .
    OPTIONAL { ?subject rdfs:label ?label . }
    OPTIONAL { ?subject bibo:abstract ?abstract . }
    OPTIONAL { ?subject bibo:doi ?doi . }
    OPTIONAL { ?subject bibo:volume ?volume . }
    OPTIONAL { ?subject bibo:pageStart ?pageStart . }
    OPTIONAL { ?subject bibo:pageEnd ?pageEnd . }

    OPTIONAL {
      ?subject vivo:relatedBy ?author .
      ?author rdf:type vivo:Authorship .
      OPTIONAL { ?author vivo:rank ?authorRank . }
      OPTIONAL { 
        ?author vivo:relates ?authorIndividual .
        ?authorIndividual rdf:type vcard:Individual . 
        ?authorIndividual vcard:hasName ?authorVcardName .
        OPTIONAL { ?authorVcardName vcard:givenName ?authorGivenName . }
        OPTIONAL { ?authorVcardName vcard:middleName ?authorMiddleName . }
        OPTIONAL { ?authorVcardName vcard:familyName ?authorFamilyName . }   
      }
      OPTIONAL{ 
        ?author vivo:relates ?authorPerson .
        ?authorPerson rdf:type foaf:Person .
        OPTIONAL { ?authorPerson vivo:orcidid ?authorOrcid . }
        OPTIONAL { ?authorPerson rdfs:label ?authorLabel . }
      }
    }

    OPTIONAL { 
      ?subject obo:ARG_2000028 ?hasContactInfo .
      ?hasContactInfo vcard:hasURL ?contactInfoHasUrl .
      OPTIONAL { ?contactInfoHasUrl vcard:url ?contactInfoUrl . }
      OPTIONAL { ?contactInfoHasUrl vivo:rank ?contactInfoRank . }
      OPTIONAL { ?contactInfoHasUrl rdfs:label ?contactInfoLabel . }
    }

    OPTIONAL {
      ?subject vivo:hasSubjectArea ?subjectArea .
      ?subjectArea rdfs:label ?subjectAreaLabel .
      ?subjectArea rdf:type ?subjectAreaType .
    }

    OPTIONAL {
      ?subject vivo:hasPublicationVenue ?publicationVenue .
      ?publicationVenue rdf:type ?publicationVenueType .
      ?publicationVenue bibo:issn ?publicationVenueIssn .
    }

    OPTIONAL {
      ?subject vivo:informationResourceSupportedBy ?supportedBy .
      ?supportedBy rdfs:label ?supportedByLabel .
    }

    OPTIONAL {
      ?subject vivo:dateTimeValue ?publicationDate . 
      OPTIONAL { ?publicationDate vivo:dateTime ?dateTime . }
    }

    FILTER(?subject = <${uri}>)
  }
}`